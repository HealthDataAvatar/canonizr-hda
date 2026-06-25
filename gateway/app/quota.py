"""Per-key quota enforcement backed by Redis.

Quotas are period-scoped: each billing period (aligned to the user's
billing anchor day) gets its own Redis counter. Old counters expire
naturally via TTL.

Redis keys:
    sub:{sub_id}:bytes:{period_start}   bytes used this billing period
    sub:{sub_id}:quota:bytes            user-configured limit (absent = unlimited)
    sub:{sub_id}:rejected               rejected attempt count (short TTL)
"""

import calendar
import logging
from dataclasses import dataclass
from datetime import UTC, date, datetime

from azure.data.tables import TableServiceClient

from .keys import account_usage, quota_limit, quota_rejected, quota_usage
from .protocols import RedisQuotaCache, UserContext

logger = logging.getLogger(__name__)


CACHE_TTL = 3600  # 1 hour
SENTINEL_NONE = "none"  # cached "no quota set"


@dataclass
class Rejection:
    """A typed quota rejection. `code` is machine-readable; the SDK branches on it."""

    status: int
    code: str  # rate_limited | quota_exceeded | payment_required
    detail: str


def _anchor_date(year: int, month: int, anchor_day: int) -> date:
    """The anchor day in a given month, clamped to the last day (e.g. 31 in Feb -> 28)."""
    last = calendar.monthrange(year, month)[1]
    return date(year, month, min(anchor_day, last))


def current_period_start(anchor_day: int, now: date | None = None) -> str:
    """Compute the start date (YYYY-MM-DD) of the current billing period.

    The anchor_day is the day of month the user's Stripe subscription was
    created. If anchor_day > days in a given month, clamp to last day.
    All calculations are in UTC.
    """
    today = now or datetime.now(UTC).date()

    period = _anchor_date(today.year, today.month, anchor_day)
    if today >= period:
        return period.isoformat()

    # Haven't reached anchor day yet — period started last month
    if today.month == 1:
        return _anchor_date(today.year - 1, 12, anchor_day).isoformat()
    return _anchor_date(today.year, today.month - 1, anchor_day).isoformat()


def period_ttl(anchor_day: int, now: date | None = None) -> int:
    """Seconds until the next billing period starts (for Redis TTL)."""
    today = now or datetime.now(UTC).date()

    period = _anchor_date(today.year, today.month, anchor_day)
    if today >= period:
        # Next period is next month
        if today.month == 12:
            next_period = _anchor_date(today.year + 1, 1, anchor_day)
        else:
            next_period = _anchor_date(today.year, today.month + 1, anchor_day)
    else:
        next_period = period

    remaining = (next_period - today).days
    return max(remaining * 86400, 86400)  # at least 1 day


class QuotaService:
    """Quota enforcement. Wraps Redis so callers don't need to know the backend."""

    def __init__(
        self,
        r: RedisQuotaCache,
        rejected_ttl: int = 3600,
        max_rejected: int = 50,
        *,
        table_service: TableServiceClient | None = None,
    ):
        self._r = r
        self._rejected_ttl = rejected_ttl
        self._max_rejected = max_rejected
        self._ts = table_service

    async def check(self, user: UserContext, sub_id: str, content_length: int) -> Rejection | None:
        """Check whether a request is allowed. Returns None if allowed, else a Rejection.

        Order: too-many-rejections (rate_limited) -> free line (payment_required)
        -> account cap (quota_exceeded) -> per-key quota (quota_exceeded).
        """
        # Comp accounts are truly unlimited — never gated, never metered.
        if user.comp:
            return None

        anchor_day = user.billing_anchor_day
        rejected_count = await self._r.get(quota_rejected(sub_id=sub_id))
        if rejected_count and int(rejected_count) >= self._max_rejected:
            return Rejection(429, "rate_limited", "Too many rejected requests — try again later")

        ps = current_period_start(anchor_day)

        # Account-level usage drives both the free-line gate and the hard cap.
        acct_usage = await self._account_usage(user.user_id, ps, anchor_day)
        projected = acct_usage + content_length

        # Free line: block at the opt-in boundary until the user has enabled paid usage.
        if not user.paid_enabled and user.free_bytes is not None and projected > user.free_bytes:
            return Rejection(402, "payment_required", "Enable paid usage to continue past the free allowance")

        # Hard account cap = min(user, admin), resolved in the resolver. Not transient.
        if user.cap_bytes is not None and projected > user.cap_bytes:
            await self._incr_rejected(quota_rejected(sub_id=sub_id))
            return Rejection(429, "quota_exceeded", "Account quota for this period is spent")

        # Per-key quota (unchanged): independent of the account cap.
        key_rej = await self._check_key_quota(sub_id, content_length, anchor_day, ps)
        if key_rej is not None:
            return key_rej

        return None

    async def _check_key_quota(self, sub_id: str, content_length: int, anchor_day: int, ps: str) -> Rejection | None:
        quota_val = await self._r.get(quota_limit(sub_id=sub_id))
        if quota_val is None:
            table_val = self._lookup_quota_from_table(sub_id)
            if table_val is not None:
                quota_val = str(table_val)
                await self._r.set(quota_limit(sub_id=sub_id), quota_val, ex=CACHE_TTL)
            else:
                await self._r.set(quota_limit(sub_id=sub_id), SENTINEL_NONE, ex=CACHE_TTL)
                return None

        if quota_val == SENTINEL_NONE:
            return None

        limit = int(quota_val)
        usage = await self._key_usage(sub_id, ps, anchor_day)

        if usage + content_length > limit:
            await self._incr_rejected(quota_rejected(sub_id=sub_id))
            remaining = max(0, limit - usage)
            return Rejection(
                429,
                "quota_exceeded",
                f"File too large for remaining quota ({content_length} bytes, {remaining} remaining)",
            )
        return None

    async def _key_usage(self, sub_id: str, ps: str, anchor_day: int) -> int:
        raw = await self._r.get(quota_usage(sub_id=sub_id, period_start=ps))
        if raw is not None:
            return int(raw)
        usage = self._reconstruct_usage_from_table(sub_id, ps)
        if usage > 0:
            await self._r.set(quota_usage(sub_id=sub_id, period_start=ps), str(usage), ex=period_ttl(anchor_day))
        return usage

    async def _account_usage(self, user_id: str, ps: str, anchor_day: int) -> int:
        raw = await self._r.get(account_usage(user_id=user_id, period_start=ps))
        if raw is not None:
            return int(raw)
        usage = self._reconstruct_account_usage_from_table(user_id, ps)
        if usage > 0:
            await self._r.set(account_usage(user_id=user_id, period_start=ps), str(usage), ex=period_ttl(anchor_day))
        return usage

    async def record(self, sub_id: str, user_id: str, input_bytes: int, period_start: str, anchor_day: int = 1) -> None:
        """Increment per-key and per-account usage counters after accepting a job."""
        for key in (
            quota_usage(sub_id=sub_id, period_start=period_start),
            account_usage(user_id=user_id, period_start=period_start),
        ):
            await self._r.incrby(key, input_bytes)
            await self._r.expire(key, period_ttl(anchor_day))

    async def refund(self, sub_id: str, user_id: str, input_bytes: int, period_start: str, anchor_day: int = 1) -> None:
        """Decrement both counters on job failure.

        Must target the same period_start the charge landed in — recomputing
        it from the wall clock would refund the wrong period across a rollover.
        """
        for key in (
            quota_usage(sub_id=sub_id, period_start=period_start),
            account_usage(user_id=user_id, period_start=period_start),
        ):
            await self._r.decrby(key, input_bytes)
            await self._r.expire(key, period_ttl(anchor_day))

    async def _incr_rejected(self, key: str) -> None:
        """Increment a rejection counter with TTL. Two commands for cluster compat."""
        await self._r.incr(key)
        await self._r.expire(key, self._rejected_ttl)

    def _reconstruct_usage_from_table(self, sub_id: str, period_start: str) -> int:
        """Sum input_bytes from GwJobs for this sub_id in the current period."""
        return self._reconstruct("sub_id", sub_id, period_start)

    def _reconstruct_account_usage_from_table(self, user_id: str, period_start: str) -> int:
        """Sum input_bytes from GwJobs across all of a user's keys in the current period."""
        return self._reconstruct("user_id", user_id, period_start)

    def _reconstruct(self, field: str, value: str, period_start: str) -> int:
        """Sum input_bytes from GwJobs where `field` == value in the current period.

        Cross-partition scan filtered server-side. Only runs on Redis cache miss.
        """
        from .tables import Table

        if self._ts is None:
            return 0
        try:
            table = self._ts.get_table_client(Table.GW_JOBS)
            filter_expr = f"{field} eq '{value}' and status eq 'ok' and completed_at ge '{period_start}T00:00:00Z'"
            total = 0
            seen: set[str] = set()
            for entity in table.query_entities(filter_expr):
                job_id = str(entity.get("job_id", ""))
                if not job_id or job_id in seen:
                    continue
                seen.add(job_id)
                total += int(entity.get("input_bytes", 0))
            return total
        except Exception as e:
            logger.warning("Usage reconstruction failed for %s=%s: %s", field, value, e)
            return 0

    def _lookup_quota_from_table(self, sub_id: str) -> int | None:
        """Read quota_bytes from GwSubscriptions in Table Storage."""
        from .tables import Table

        if self._ts is None:
            return None
        try:
            table = self._ts.get_table_client(Table.GW_SUBSCRIPTIONS)
            entity = table.get_entity("subscription", sub_id)
            val = entity.get("quota_bytes")
            if val is None or int(val) < 0:
                return None  # -1 sentinel or missing = no quota
            return int(val)
        except Exception as e:
            logger.warning("Quota table lookup failed for %s: %s", sub_id, e)
            return None
