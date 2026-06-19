"""Azure Table Storage + Redis implementation of UserResolver protocol.

Lookup chain:
  sub_id -> user_id (Redis cache, then Table Storage)
  user_id -> encryption key (Redis cache, then Table Storage)
  user_id -> billing_anchor_day (Redis cache, then GwBilling table)
"""

import json
import logging

from azure.data.tables import TableServiceClient

from .estimates import UNIT_BYTES
from .keys import (
    billing_anchor_cache,
    encryption_key_cache,
    key_name_cache,
    price_per_unit_cache,
    user_blocked,
    user_config_cache,
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
        # price_per_unit defaults to DEFAULT_PRICE_PER_UNIT when unconfigured (never blocks).
        ppu = await self._get_price_per_unit(uid)
        anchor = await self._get_billing_anchor(uid)
        free_bytes, paid_enabled, cap_bytes = await self._get_quota_config(uid)

        return UserContext(
            user_id=uid,
            encryption_key=bytes.fromhex(key_hex),
            key_id=kname,
            price_per_unit=ppu,
            billing_anchor_day=anchor,
            free_bytes=free_bytes,
            paid_enabled=paid_enabled,
            cap_bytes=cap_bytes,
        )

    # --- cache-aside helpers -------------------------------------------------

    async def _cached_str(self, ck: str, loader) -> str | None:
        """Read a string field through the cache. Only caches a found value."""
        cached = await self._r.get(ck)
        if cached:
            return cached
        val = loader()
        if val:
            await self._r.set(ck, val, ex=CACHE_TTL)
        return val

    async def _cached_num(self, ck: str, loader, *, default, cast):
        """Read a numeric field through the cache. Always caches (incl. the default)."""
        cached = await self._r.get(ck)
        if cached is not None:
            return cast(cached)
        raw = loader()
        val = cast(raw) if raw is not None else default
        await self._r.set(ck, str(val), ex=CACHE_TTL)
        return val

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
        return await self._cached_str(
            user_id_cache(sub_id=sub_id),
            lambda: self._table_lookup(Table.GW_SUBSCRIPTIONS, "subscription", sub_id, "user_id"),
        )

    async def _get_user_key(self, user_id: str) -> str | None:
        return await self._cached_str(
            encryption_key_cache(user_id=user_id),
            lambda: self._table_lookup(Table.GW_ENCRYPTION_KEYS, "key", user_id, "key_hex"),
        )

    async def _get_key_name(self, sub_id: str) -> str:
        return (
            await self._cached_str(
                key_name_cache(sub_id=sub_id),
                lambda: self._table_lookup(Table.GW_SUBSCRIPTIONS, "subscription", sub_id, "key_name"),
            )
            or ""
        )

    async def _get_price_per_unit(self, user_id: str) -> float:
        return await self._cached_num(
            price_per_unit_cache(user_id=user_id),
            lambda: self._get_latest_config(user_id, "pricePerUnit"),
            default=0.003,
            cast=float,
        )

    async def _get_quota_config(self, user_id: str) -> tuple[int | None, bool, int | None]:
        """Resolve (free_bytes, paid_enabled, cap_bytes) from UserConfig.

        Caps are stored in 100KB units; converted to bytes here so the rest of
        the gateway stays in bytes. cap_bytes = min(user, admin) caps (lower wins,
        null = unlimited). Cached as a JSON blob — all three change together.
        """
        ck = user_config_cache(user_id=user_id)
        cached = await self._r.get(ck)
        if cached is not None:
            d = json.loads(cached)
            return d["free_bytes"], d["paid_enabled"], d["cap_bytes"]

        row = self._get_latest_config_row(user_id)
        free_units = row.get("freeUnits") if row else None
        paid_enabled = bool(row.get("paidEnabled")) if row else False
        user_cap = row.get("spendCapUnits") if row else None
        admin_cap = row.get("adminCapUnits") if row else None

        free_bytes = int(free_units) * UNIT_BYTES if free_units is not None else None
        caps = [int(c) for c in (user_cap, admin_cap) if c is not None]
        cap_bytes = min(caps) * UNIT_BYTES if caps else None

        await self._r.set(
            ck,
            json.dumps({"free_bytes": free_bytes, "paid_enabled": paid_enabled, "cap_bytes": cap_bytes}),
            ex=CACHE_TTL,
        )
        return free_bytes, paid_enabled, cap_bytes

    async def _get_billing_anchor(self, user_id: str) -> int:
        return await self._cached_num(
            billing_anchor_cache(user_id=user_id),
            lambda: self._table_lookup(Table.GW_BILLING, "billing", user_id, "billing_anchor_day"),
            default=1,
            cast=int,
        )

    def _get_latest_config(self, user_id: str, field: str):
        """Read a field from the latest UserConfig row (append-only, newest first)."""
        row = self._get_latest_config_row(user_id)
        return row.get(field) if row else None

    def _get_latest_config_row(self, user_id: str) -> dict | None:
        """Read the latest UserConfig row (append-only, newest first)."""
        try:
            table = self._ts.get_table_client(Table.USER_CONFIG)
            for entity in table.query_entities(f"PartitionKey eq '{user_id}'"):
                return dict(entity)
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
