"""API key authentication — resolves a bearer token to a subscription ID.

Replaces APIM's subscription key validation. The gateway now validates
API keys directly by hashing the token and looking up GwApiKeys in
Table Storage (with Redis cache).
"""

import hashlib
import logging
from typing import Any, Protocol

from azure.core.exceptions import ResourceNotFoundError

from .keys import api_key_cache
from .protocols import RedisKVCache
from .tables import Table

logger = logging.getLogger(__name__)

CACHE_TTL = 3600  # 1 hour


class TableService(Protocol):
    """Minimal protocol for table service — only what auth needs."""

    def get_table_client(self, table_name: str) -> Any: ...


def hash_api_key(key: str) -> str:
    """SHA-256 hash of an API key value. Used as lookup key in GwApiKeys."""
    return hashlib.sha256(key.encode()).hexdigest()


async def resolve_api_key(
    key: str,
    table_service: TableService,
    redis: RedisKVCache,
) -> str | None:
    """Resolve a plaintext API key to a subscription ID, or None if invalid.

    Checks Redis cache first, falls back to GwApiKeys table.
    """
    key_hash = hash_api_key(key)
    cache_key = api_key_cache(key_hash=key_hash)

    cached = await redis.get(cache_key)
    if cached:
        return cached

    table = table_service.get_table_client(Table.GW_API_KEYS)
    try:
        entity = table.get_entity("key", key_hash)
        sub_id = str(entity["sub_id"])
        await redis.set(cache_key, sub_id, ex=CACHE_TTL)
        return sub_id
    except ResourceNotFoundError:
        logger.debug("API key not found in GwApiKeys (hash=%s...)", key_hash[:8])
        return None
    # Any other error (Table outage, throttling) propagates → 5xx, not a false "invalid key" 401.
