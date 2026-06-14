"""Azure Table Storage + Redis implementation of UserResolver protocol.

Lookup chain:
  sub_id -> user_id (Redis cache, then Table Storage)
  user_id -> encryption key (Redis cache, then Table Storage)
  user_id -> billing_anchor_day (Redis cache, then GwBilling table)
"""

import logging

from azure.data.tables import TableServiceClient

from .keys import (
    billing_anchor_cache,
    encryption_key_cache,
    key_name_cache,
    price_per_unit_cache,
    user_blocked,
    user_id_cache,
)
from .protocols import RedisKVCache, ResolveMisconfigured, ResolveRejected, ResolveResult, UserContext
from .tables import Table

logger = logging.getLogger(__name__)

CACHE_TTL = 3600  # 1 hour
BLOCKED_CACHE_TTL = 300  # 5 minutes — blocks take effect quickly


class TableUserResolver:
    """UserResolver backed by Azure Table Storage with Redis caching."""

    def __init__(self, r: RedisKVCache, table_service: TableServiceClient):
        self._r = r
        self._ts = table_service

    async def resolve(self, sub_id: str) -> ResolveResult:
        """Resolve a subscription to a user context.

        Returns UserContext on success, None if unknown, ResolveRejected if
        blocked, or ResolveMisconfigured if account is broken.
        """
        uid = await self._get_user_id(sub_id)
        if not uid:
            return None

        if await self._is_blocked(uid):
            logger.warning("Blocked user %s attempted request", uid)
            return ResolveRejected("Account is blocked", 403)

        key_hex = await self._get_user_key(uid)
        if not key_hex:
            logger.error("User %s has no encryption key", uid)
            return ResolveMisconfigured("No encryption key")

        kname = await self._get_key_name(sub_id)
        ppu = await self._get_price_per_unit(uid)
        if ppu is None:
            logger.error("User %s has no price_per_unit in UserConfig", uid)
            return ResolveMisconfigured("No price_per_unit in UserConfig")

        anchor = await self._get_billing_anchor(uid)

        return UserContext(
            user_id=uid,
            encryption_key=bytes.fromhex(key_hex),
            key_id=kname,
            price_per_unit=ppu,
            billing_anchor_day=anchor,
        )

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

    async def _get_price_per_unit(self, user_id: str) -> float:
        ck = price_per_unit_cache(user_id=user_id)
        cached = await self._r.get(ck)
        if cached is not None:
            return float(cached)

        val = self._get_latest_config(user_id, "pricePerUnit")
        ppu = float(val) if val is not None else 0.003
        await self._r.set(ck, str(ppu), ex=CACHE_TTL)
        return ppu

    async def _get_billing_anchor(self, user_id: str) -> int:
        ck = billing_anchor_cache(user_id=user_id)
        cached = await self._r.get(ck)
        if cached is not None:
            return int(cached)

        val = self._table_lookup(Table.GW_BILLING, "billing", user_id, "billing_anchor_day")
        anchor = int(val) if val is not None else 1
        await self._r.set(ck, str(anchor), ex=CACHE_TTL)
        return anchor

    def _get_latest_config(self, user_id: str, field: str):
        """Read a field from the latest UserConfig row (append-only, newest first)."""
        try:
            table = self._ts.get_table_client(Table.USER_CONFIG)
            for entity in table.query_entities(f"PartitionKey eq '{user_id}'"):
                return entity.get(field)
            return None
        except Exception as e:
            logger.warning("UserConfig lookup failed for %s: %s", user_id, e)
            return None

    def _get_latest_permission(self, user_id: str, field: str):
        """Read a field from the latest UserPermissions row (append-only, newest first)."""
        try:
            table = self._ts.get_table_client(Table.USER_PERMISSIONS)
            for entity in table.query_entities(f"PartitionKey eq '{user_id}'"):
                return entity.get(field)
            return None
        except Exception as e:
            logger.warning("UserPermissions lookup failed for %s: %s", user_id, e)
            return None

    def _table_lookup(self, table_name: str, partition: str, row: str, field: str) -> str | None:
        try:
            table = self._ts.get_table_client(table_name)
            entity = table.get_entity(partition, row)
            return entity.get(field)
        except Exception as e:
            logger.warning("Table lookup failed: %s/%s/%s — %s", table_name, partition, row, e)
            return None
