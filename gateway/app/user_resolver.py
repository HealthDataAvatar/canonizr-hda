"""Azure Table Storage + Redis implementation of UserResolver protocol.

Lookup chain:
  sub_id → user_id (Redis cache, then Table Storage)
  user_id → encryption key (Redis cache, then Table Storage)

Production: uses DefaultAzureCredential (managed identity) with endpoint URL.
Tests (Azurite): uses connection string.
"""

import logging

import redis.asyncio as aioredis
from azure.data.tables import TableServiceClient

from .keys import encryption_key_cache, key_name_cache, user_blocked, user_id_cache
from .protocols import UserContext
from .tables import Table

logger = logging.getLogger(__name__)

CACHE_TTL = 3600  # 1 hour
BLOCKED_CACHE_TTL = 300  # 5 minutes — blocks take effect quickly


class TableUserResolver:
    """UserResolver backed by Azure Table Storage with Redis caching."""

    def __init__(self, r: aioredis.Redis, *, endpoint: str = "", connection_string: str = ""):
        self._r = r
        self._endpoint = endpoint
        self._conn_str = connection_string

    async def resolve(self, sub_id: str) -> UserContext | None:
        uid = await self._get_user_id(sub_id)
        if not uid:
            return None

        if await self._is_blocked(uid):
            logger.warning("Blocked user %s attempted request", uid)
            return None

        key_hex = await self._get_user_key(uid)
        if not key_hex:
            logger.error("User %s has no encryption key", uid)
            return None

        kname = await self._get_key_name(sub_id)

        return UserContext(user_id=uid, encryption_key=bytes.fromhex(key_hex), key_name=kname)

    async def _is_blocked(self, user_id: str) -> bool:
        ck = user_blocked(user_id=user_id)
        cached = await self._r.get(ck)
        if cached is not None:
            return cached == "1"

        blocked = self._get_latest_permission(user_id, "blocked")
        is_blocked = blocked is True or blocked == "true"
        await self._r.set(ck, "1" if is_blocked else "0", ex=BLOCKED_CACHE_TTL)
        return is_blocked

    async def _get_user_id(self, sub_id: str) -> str | None:
        ck = user_id_cache(sub_id=sub_id)
        cached = await self._r.get(ck)
        if cached:
            return cached

        val = self._table_lookup(Table.GW_SUBSCRIPTIONS, "subscription", sub_id, "user_id")
        if val:
            await self._r.set(ck, val, ex=CACHE_TTL)
        return val

    async def _get_user_key(self, user_id: str) -> str | None:
        ck = encryption_key_cache(user_id=user_id)
        cached = await self._r.get(ck)
        if cached:
            return cached

        val = self._table_lookup(Table.GW_ENCRYPTION_KEYS, "key", user_id, "key_hex")
        if val:
            await self._r.set(ck, val, ex=CACHE_TTL)
        return val

    async def _get_key_name(self, sub_id: str) -> str:
        ck = key_name_cache(sub_id=sub_id)
        cached = await self._r.get(ck)
        if cached:
            return cached

        val = self._table_lookup(Table.GW_SUBSCRIPTIONS, "subscription", sub_id, "key_name")
        if val:
            await self._r.set(ck, val, ex=CACHE_TTL)
        return val or ""

    def _get_latest_permission(self, user_id: str, field: str):
        """Read a field from the latest UserPermissions row (append-only, newest first)."""
        try:
            service = self._get_table_service()
            if not service:
                return None
            table = service.get_table_client(Table.USER_PERMISSIONS)
            for entity in table.query_entities(f"PartitionKey eq '{user_id}'"):
                return entity.get(field)
            return None
        except Exception as e:
            logger.warning("UserPermissions lookup failed for %s: %s", user_id, e)
            return None

    def _get_table_service(self) -> TableServiceClient | None:
        if self._endpoint:
            from .azure_auth import get_credential

            credential = get_credential()
            if credential is None:
                return None
            return TableServiceClient(self._endpoint, credential=credential)
        elif self._conn_str:
            return TableServiceClient.from_connection_string(self._conn_str)
        return None

    def _table_lookup(self, table_name: str, partition: str, row: str, field: str) -> str | None:
        if not self._endpoint and not self._conn_str:
            return None
        try:
            if self._endpoint:
                from .azure_auth import get_credential

                credential = get_credential()
                if credential is None:
                    return None
                service = TableServiceClient(self._endpoint, credential=credential)
            else:
                service = TableServiceClient.from_connection_string(self._conn_str)
            table = service.get_table_client(table_name)
            entity = table.get_entity(partition, row)
            return entity.get(field)
        except Exception as e:
            logger.warning("Table lookup failed: %s/%s/%s — %s", table_name, partition, row, e)
            return None
