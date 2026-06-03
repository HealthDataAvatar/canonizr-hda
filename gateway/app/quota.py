"""Per-key quota enforcement backed by Redis.

Reads the subscription ID from the X-Subscription-Id header (injected by APIM)
and enforces byte-based quotas stored in Redis.

Redis keys:
    sub:{sub_id}:bytes          cumulative bytes this billing period
    sub:{sub_id}:quota:bytes    user-configured limit (absent = unlimited)
    sub:{sub_id}:rejected       rejected attempt count (short TTL)
"""

import logging

from azure.data.tables import TableServiceClient

from .protocols import RedisQuotaCache

logger = logging.getLogger(__name__)


CACHE_TTL = 3600  # 1 hour
SENTINEL_NONE = "none"  # cached "no quota set"


class QuotaService:
    """Quota enforcement. Wraps Redis so callers don't need to know the backend."""

    def __init__(
        self,
        r: RedisQuotaCache,
        rejected_ttl: int = 3600,
        max_rejected: int = 50,
        billing_period_ttl: int = 2_678_400,
        *,
        table_service: TableServiceClient | None = None,
    ):
        self._r = r
        self._rejected_ttl = rejected_ttl
        self._max_rejected = max_rejected
        self._billing_period_ttl = billing_period_ttl
        self._ts = table_service

    async def check(self, sub_id: str, content_length: int) -> str | None:
        """Check if a subscription has remaining quota.

        Returns None if allowed, or an error message string if blocked.
        """
        from .keys import quota_limit, quota_rejected, quota_usage

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
        usage = int(await self._r.get(quota_usage(sub_id=sub_id)) or 0)

        if usage >= limit:
            await self._incr_rejected(quota_rejected(sub_id=sub_id))
            return f"Quota exceeded ({usage} / {limit} bytes used)"

        if usage + content_length > limit:
            await self._incr_rejected(quota_rejected(sub_id=sub_id))
            remaining = limit - usage
            return f"File too large for remaining quota ({content_length} bytes, {remaining} remaining)"

        return None

    async def record(self, sub_id: str, input_bytes: int) -> None:
        """Increment the usage counter after accepting a job."""
        from .keys import quota_usage

        key = quota_usage(sub_id=sub_id)
        await self._r.incrby(key, input_bytes)
        await self._r.expire(key, self._billing_period_ttl)

    async def refund(self, sub_id: str, input_bytes: int) -> None:
        """Decrement the usage counter on job failure."""
        from .keys import quota_usage

        key = quota_usage(sub_id=sub_id)
        await self._r.decrby(key, input_bytes)
        await self._r.expire(key, self._billing_period_ttl)

    async def _incr_rejected(self, key: str) -> None:
        """Increment a rejection counter with TTL. Two commands for cluster compat."""
        await self._r.incr(key)
        await self._r.expire(key, self._rejected_ttl)

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
