"""Per-key quota enforcement backed by Redis.

Reads the subscription ID from the X-Subscription-Id header (injected by APIM)
and enforces byte-based quotas stored in Redis.

Redis keys:
    sub:{sub_id}:bytes          cumulative bytes this billing period
    sub:{sub_id}:quota:bytes    user-configured limit (absent = unlimited)
    sub:{sub_id}:rejected       rejected attempt count (short TTL)
"""

import logging
import os
from typing import Any

import redis.asyncio as redis

logger = logging.getLogger(__name__)

REDIS_URL = os.environ.get("REDIS_URL", "")

_pool: redis.Redis | None = None


async def get_redis() -> redis.Redis | None:
    """Return a shared Redis connection, or None if not configured.

    Azure Managed Redis uses clustering even on the smallest tier (B0).
    Detect by port 10000 (Azure convention) and use RedisCluster.
    Local dev uses standard Redis on port 6379.
    """
    global _pool
    if not REDIS_URL:
        return None
    if _pool is None:
        if ":10000" in REDIS_URL:
            _pool = redis.RedisCluster.from_url(REDIS_URL, decode_responses=True)  # type: ignore[assignment]
        else:
            _pool = redis.from_url(REDIS_URL, decode_responses=True)
    return _pool


async def close():
    """Shut down the Redis connection pool."""
    global _pool
    if _pool is not None:
        await _pool.aclose()
        _pool = None


class QuotaService:
    """Quota enforcement. Wraps Redis so callers don't need to know the backend."""

    def __init__(
        self,
        r: "redis.Redis | Any",  # noqa: F821 — accepts FakeRedis in tests
        rejected_ttl: int = 3600,
        max_rejected: int = 50,
        billing_period_ttl: int = 2_678_400,
    ):
        self._r = r
        self._rejected_ttl = rejected_ttl
        self._max_rejected = max_rejected
        self._billing_period_ttl = billing_period_ttl

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
