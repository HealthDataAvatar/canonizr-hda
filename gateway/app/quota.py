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

import redis.asyncio as redis

logger = logging.getLogger(__name__)

REDIS_URL = os.environ.get("REDIS_URL", "")
REJECTED_TTL = int(os.environ.get("QUOTA_REJECTED_TTL", "3600"))
MAX_REJECTED_BEFORE_BLOCK = int(os.environ.get("QUOTA_MAX_REJECTED", "50"))

_pool: redis.Redis | None = None


async def get_redis() -> redis.Redis | None:
    """Return a shared Redis connection, or None if not configured."""
    global _pool
    if not REDIS_URL:
        return None
    if _pool is None:
        _pool = redis.from_url(REDIS_URL, decode_responses=True)
    return _pool


async def close():
    """Shut down the Redis connection pool."""
    global _pool
    if _pool is not None:
        await _pool.aclose()
        _pool = None


async def _incr_with_ttl(r: redis.Redis, key: str, ttl: int) -> None:
    """Increment a counter and set its TTL. Two separate commands for cluster compatibility."""
    await r.incr(key)
    await r.expire(key, ttl)


async def check_quota(sub_id: str, content_length: int) -> str | None:
    """Check if a subscription has remaining quota.

    Returns None if the request is allowed, or an error message if blocked.
    """
    r = await get_redis()
    if r is None:
        return None

    rejected_key = f"sub:{sub_id}:rejected"

    # Check if this key is temporarily blocked due to repeated rejections
    rejected_count = await r.get(rejected_key)
    if rejected_count and int(rejected_count) >= MAX_REJECTED_BEFORE_BLOCK:
        return "Too many rejected requests — try again later"

    quota_key = f"sub:{sub_id}:quota:bytes"
    usage_key = f"sub:{sub_id}:bytes"

    quota = await r.get(quota_key)
    if quota is None:
        # No quota set — unlimited
        return None

    quota = int(quota)
    usage = int(await r.get(usage_key) or 0)

    if usage >= quota:
        await _incr_with_ttl(r, rejected_key, REJECTED_TTL)
        return f"Quota exceeded ({usage} / {quota} bytes used)"

    if usage + content_length > quota:
        await _incr_with_ttl(r, rejected_key, REJECTED_TTL)
        remaining = quota - usage
        return f"File too large for remaining quota ({content_length} bytes, {remaining} remaining)"

    return None


async def record_usage(sub_id: str, input_bytes: int, billing_period_ttl: int = 2_678_400):
    """Increment the usage counter for a subscription after successful processing.

    billing_period_ttl defaults to ~31 days. The counter auto-expires at period end.
    """
    r = await get_redis()
    if r is None:
        return

    usage_key = f"sub:{sub_id}:bytes"

    await r.incrby(usage_key, input_bytes)
    await r.expire(usage_key, billing_period_ttl)
