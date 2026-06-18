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
from datetime import UTC, date, datetime

from azure.data.tables import TableServiceClient

from .keys import quota_limit, quota_rejected, quota_usage
from .protocols import RedisQuotaCache

logger = logging.getLogger(__name__)


CACHE_TTL = 3600  # 1 hour
SENTINEL_NONE = "none"  # cached "no quota set"


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

    async def check(self, sub_id: str, content_length: int, anchor_day: int = 1) -> str | None:
        """Check if a subscription has remaining quota.

        Returns None if allowed, or an error message string if blocked.
        """
        rejected_count = await self._r.get(quota_rejected(sub_id=sub_id))
        if rejected_count and int(rejected_count) >= self._max_rejected:
            return "Too many rejected requests — try again later"

        quota_val = await self._r.get(quota_limit(sub_id=sub_id))
        if quota_val is None:
            # Cache miss — fall back to Table Storage
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
        ps = current_period_start(anchor_day)
        raw = await self._r.get(quota_usage(sub_id=sub_id, period_start=ps))
        if raw is not None:
            usage = int(raw)
        else:
            # Cache miss — reconstruct from Table Storage and seed Redis
            usage = self._reconstruct_usage_from_table(sub_id, ps)
            if usage > 0:
                key = quota_usage(sub_id=sub_id, period_start=ps)
                await self._r.set(key, str(usage), ex=period_ttl(anchor_day))

        if usage >= limit:
            await self._incr_rejected(quota_rejected(sub_id=sub_id))
            return f"Quota exceeded ({usage} / {limit} bytes used)"

        if usage + content_length > limit:
            await self._incr_rejected(quota_rejected(sub_id=sub_id))
            remaining = limit - usage
            return f"File too large for remaining quota ({content_length} bytes, {remaining} remaining)"

        return None

    async def record(self, sub_id: str, input_bytes: int, period_start: str, anchor_day: int = 1) -> None:
        """Increment the usage counter for a billing period after accepting a job."""
        key = quota_usage(sub_id=sub_id, period_start=period_start)
        await self._r.incrby(key, input_bytes)
        await self._r.expire(key, period_ttl(anchor_day))

    async def refund(self, sub_id: str, input_bytes: int, period_start: str, anchor_day: int = 1) -> None:
        """Decrement the usage counter on job failure.

        Must target the same period_start the charge landed in — recomputing
        it from the wall clock would refund the wrong period across a rollover.
        """
        key = quota_usage(sub_id=sub_id, period_start=period_start)
        await self._r.decrby(key, input_bytes)
        await self._r.expire(key, period_ttl(anchor_day))

    async def _incr_rejected(self, key: str) -> None:
        """Increment a rejection counter with TTL. Two commands for cluster compat."""
        await self._r.incr(key)
        await self._r.expire(key, self._rejected_ttl)

    def _reconstruct_usage_from_table(self, sub_id: str, period_start: str) -> int:
        """Sum input_bytes from GwJobs for this sub_id in the current period.

        Cross-partition scan filtered server-side. Only runs on Redis cache miss.
        """
        from .tables import Table

        if self._ts is None:
            return 0
        try:
            table = self._ts.get_table_client(Table.GW_JOBS)
            filter_expr = f"sub_id eq '{sub_id}' and status eq 'ok' and completed_at ge '{period_start}T00:00:00Z'"
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
            logger.warning("Usage reconstruction failed for %s: %s", sub_id, e)
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
