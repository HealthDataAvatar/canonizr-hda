"""Azure Table Storage + Redis implementation of UserResolver protocol.

Lookup chain:
  sub_id → user_id (Redis cache, then Table Storage)
  user_id → encryption key (Redis cache, then Table Storage)
"""

import logging

import redis.asyncio as aioredis
from azure.data.tables import TableServiceClient

from .keys import (
    billing_status as billing_status_key,
)
from .keys import (
    encryption_key_cache,
    key_name_cache,
    user_blocked,
    user_id_cache,
)
from .protocols import UserContext
from .tables import Table

logger = logging.getLogger(__name__)

CACHE_TTL = 3600  # 1 hour
BLOCKED_CACHE_TTL = 300  # 5 minutes — blocks take effect quickly


class TableUserResolver:
    """UserResolver backed by Azure Table Storage with Redis caching."""

    def __init__(self, r: aioredis.Redis | aioredis.RedisCluster, table_service: TableServiceClient):
        self._r = r
        self._ts = table_service

    async def resolve(self, sub_id: str) -> UserContext | None | str:
        """Resolve a subscription to a user context.

        Returns UserContext on success, None if unknown, or an error string if blocked/misconfigured.
        """
        uid = await self._get_user_id(sub_id)
        if not uid:
            return None

        if await self._is_blocked(uid):
            logger.warning("Blocked user %s attempted request", uid)
            return "Account is blocked"

        billing_err = await self._check_billing_status(uid)
        if billing_err:
            logger.warning("Billing block for user %s: %s", uid, billing_err)
            return billing_err

        key_hex = await self._get_user_key(uid)
        if not key_hex:
            logger.error("User %s has no encryption key", uid)
            return "Account configuration error — please contact support"

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

    _BILLING_ERRORS: dict[str, str] = {
        "past_due": "BILLING:Payment failed — update your payment method at the billing portal",
        "canceled": "BILLING:Subscription canceled — please resubscribe to continue",
        "free_exhausted": "BILLING:Free tier exhausted — add a payment method to continue",
    }

    async def _check_billing_status(self, user_id: str) -> str | None:
        ck = billing_status_key(user_id=user_id)
        cached = await self._r.get(ck)
        if cached is not None:
            status = cached
        else:
            status = self._get_latest_permission(user_id, "billingStatus") or ""
            await self._r.set(ck, status, ex=BLOCKED_CACHE_TTL)

        return self._BILLING_ERRORS.get(status)

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
