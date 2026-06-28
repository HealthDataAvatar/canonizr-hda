"""Azure Table Storage + Redis implementation of UserResolver protocol.

Lookup chain:
  sub_id -> user_id (Redis cache, then Table Storage)
  user_id -> encryption key (Redis cache, then Table Storage)
  user_id -> billing_anchor_day (Redis cache, then GwBilling table)
"""

import json
import logging
from dataclasses import asdict, dataclass

from azure.data.tables import TableServiceClient

from .estimates import RATE_PER_UNIT, UNIT_BYTES
from .keys import (
    billing_anchor_cache,
    encryption_key_cache,
    key_name_cache,
    user_blocked,
    user_config_cache,
    user_id_cache,
)
from .protocols import RedisKVCache, ResolveMisconfigured, ResolveRejected, ResolveResult, UserContext
from .tables import Table

logger = logging.getLogger(__name__)

CACHE_TTL = 3600  # 1 hour
BLOCKED_CACHE_TTL = 300  # 5 minutes — blocks take effect quickly

# Blanket anti-abuse ceiling applied when a user has no explicit adminCapUnits.
# null in the row means "unset" -> this default, resolved live (no per-row
# backfill needed). ~1GB input / period. Raise per-user via adminCapUnits.
DEFAULT_ADMIN_CAP_UNITS = 10_000

# Hard-block codes -> (client-facing reason, machine code). "" = allowed.
_BLOCK_REASONS: dict[str, tuple[str, str] | None] = {
    "": None,
    "account_blocked": ("Account is blocked", "account_blocked"),
    "payment_overdue": ("Payment overdue — pay your invoice to restore access", "payment_overdue"),
}


def _truthy(v: object) -> bool:
    """Table Storage may store a bool or the string 'true'."""
    return v is True or v == "true"


@dataclass(frozen=True)
class QuotaConfig:
    """Per-user quota settings resolved from UserConfig (cached as JSON)."""

    free_bytes: int | None  # opt-in line; None = unlimited free
    paid_enabled: bool  # opted in to paid usage past the free line
    cap_bytes: int | None  # hard account cap = min(user, admin); None = uncapped
    comp: bool  # admin comp: truly unlimited, never metered


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

        block = await self._access_block(uid)
        if block is not None:
            reason, code = block
            logger.warning("Rejected user %s (%s) attempted request", uid, code)
            return ResolveRejected(reason, 403, code=code)

        key_hex = await self._get_user_key(uid)
        if not key_hex:
            logger.error("User %s has no encryption key", uid)
            return ResolveMisconfigured("No encryption key")

        kname = await self._get_key_name(sub_id)
        anchor = await self._get_billing_anchor(uid)
        q = await self._get_quota_config(uid)

        return UserContext(
            user_id=uid,
            encryption_key=bytes.fromhex(key_hex),
            key_id=kname,
            price_per_unit=RATE_PER_UNIT,  # snapshot the fixed Stripe rate onto the job
            billing_anchor_day=anchor,
            free_bytes=q.free_bytes,
            paid_enabled=q.paid_enabled,
            cap_bytes=q.cap_bytes,
            comp=q.comp,
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

    async def _access_block(self, user_id: str) -> tuple[str, str] | None:
        """Hard-block check. Returns (reason, code) if the user is cut off, else None.

        `blocked` (admin/abuse) and `delinquent` (payment) both 403, but carry
        distinct codes so the client shows the right message. blocked wins —
        it's the more serious / support-routed state. Cached as the code string
        ("" = allowed) so one key covers both flags.
        """
        ck = user_blocked(user_id=user_id)
        cached = await self._r.get(ck)
        if cached is not None:
            return _BLOCK_REASONS.get(cached)

        row = self._get_latest_permission_row(user_id)
        code = ""
        if _truthy(row.get("blocked")):
            code = "account_blocked"
        elif _truthy(row.get("delinquent")):
            code = "payment_overdue"
        await self._r.set(ck, code, ex=BLOCKED_CACHE_TTL)
        return _BLOCK_REASONS.get(code)

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

    async def _get_quota_config(self, user_id: str) -> QuotaConfig:
        """Resolve the per-user quota config from UserConfig.

        Caps are stored in 100KB units; converted to bytes here so the rest of
        the gateway stays in bytes. cap_bytes = min(user, admin) caps (lower wins,
        null = unlimited). comp = admin comp account (truly unlimited, never
        metered). Cached as a JSON blob — all fields change together.
        """
        ck = user_config_cache(user_id=user_id)
        cached = await self._r.get(ck)
        if cached is not None:
            return QuotaConfig(**json.loads(cached))

        row = self._get_latest_config_row(user_id)
        free_units = row.get("freeUnits") if row else None
        user_cap = row.get("spendCapUnits") if row else None
        admin_cap = row.get("adminCapUnits") if row else None
        comp = bool(row.get("comp")) if row else False

        # Unset admin cap falls back to the blanket default (comp accounts stay
        # uncapped — they short-circuit the cap check in quota.py anyway).
        if admin_cap is None and not comp:
            admin_cap = DEFAULT_ADMIN_CAP_UNITS

        caps = [int(c) for c in (user_cap, admin_cap) if c is not None]
        cfg = QuotaConfig(
            free_bytes=int(free_units) * UNIT_BYTES if free_units is not None else None,
            paid_enabled=bool(row.get("paidEnabled")) if row else False,
            cap_bytes=min(caps) * UNIT_BYTES if caps else None,
            comp=comp,
        )
        await self._r.set(ck, json.dumps(asdict(cfg)), ex=CACHE_TTL)
        return cfg

    async def _get_billing_anchor(self, user_id: str) -> int:
        return await self._cached_num(
            billing_anchor_cache(user_id=user_id),
            lambda: self._table_lookup(Table.GW_BILLING, "billing", user_id, "billing_anchor_day"),
            default=1,
            cast=int,
        )

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

    def _get_latest_permission_row(self, user_id: str) -> dict:
        """Read the latest UserPermissions row (append-only, newest first)."""
        try:
            table = self._ts.get_table_client(Table.USER_PERMISSIONS)
            for entity in table.query_entities(f"PartitionKey eq '{user_id}'"):
                return dict(entity)
            return {}
        except Exception as e:
            logger.warning("UserPermissions lookup failed for %s: %s", user_id, e)
            return {}

    def _table_lookup(self, table_name: str, partition: str, row: str, field: str) -> str | None:
        try:
            table = self._ts.get_table_client(table_name)
            entity = table.get_entity(partition, row)
            return entity.get(field)
        except Exception as e:
            logger.warning("Table lookup failed: %s/%s/%s — %s", table_name, partition, row, e)
            return None
