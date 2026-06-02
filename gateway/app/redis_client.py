"""Shared Redis client for the gateway.

Single construction point — all modules import from here.

Azure Managed Redis uses OSS clustering (even on B0). We use RedisCluster
with ssl_check_hostname=False because the TLS cert is issued for the proxy
hostname, not the internal shard IPs that RedisCluster discovers.

Local dev uses standard Redis on port 6379.
"""

import os
from urllib.parse import urlparse

import redis.asyncio as redis

REDIS_URL = os.environ.get("REDIS_URL", "")

_pool: redis.Redis | redis.RedisCluster | None = None


def _is_azure_redis(url: str) -> bool:
    """Azure Managed Redis uses port 10000 with TLS."""
    parsed = urlparse(url)
    return parsed.port == 10000


async def get_redis() -> redis.Redis | redis.RedisCluster | None:
    """Return a shared Redis connection, or None if not configured."""
    global _pool
    if not REDIS_URL:
        return None
    if _pool is None:
        if _is_azure_redis(REDIS_URL):
            parsed = urlparse(REDIS_URL)
            _pool = redis.RedisCluster(
                host=parsed.hostname or "localhost",
                port=parsed.port or 10000,
                password=parsed.password or "",
                ssl=True,
                ssl_check_hostname=False,
                decode_responses=True,
            )
        else:
            _pool = redis.from_url(REDIS_URL, decode_responses=True)
    return _pool


async def close_redis():
    """Shut down the Redis connection pool."""
    global _pool
    if _pool is not None:
        await _pool.aclose()
        _pool = None
