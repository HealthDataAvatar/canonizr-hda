"""Unit tests for API key authentication (app.auth)."""

import pytest

from app.auth import hash_api_key, resolve_api_key
from tests.fakes import FakeRedis


class FakeTableClient:
    """Minimal fake for Azure TableClient.get_entity()."""

    def __init__(self, entities: dict[tuple[str, str], dict] | None = None):
        self._entities = entities or {}

    def get_entity(self, pk: str, rk: str):
        entity = self._entities.get((pk, rk))
        if entity is None:
            from azure.core.exceptions import ResourceNotFoundError

            raise ResourceNotFoundError("Not found")
        return entity


class FakeTableService:
    """Minimal fake for Azure TableServiceClient."""

    def __init__(self, tables: dict[str, FakeTableClient] | None = None):
        self._tables = tables or {}

    def get_table_client(self, table_name: str) -> FakeTableClient:
        return self._tables.get(table_name, FakeTableClient())


class TestHashApiKey:
    def test_deterministic(self):
        assert hash_api_key("my_key") == hash_api_key("my_key")

    def test_different_keys_differ(self):
        assert hash_api_key("key_a") != hash_api_key("key_b")

    def test_returns_hex_string(self):
        h = hash_api_key("test")
        assert len(h) == 64
        assert all(c in "0123456789abcdef" for c in h)


class TestResolveApiKey:
    @pytest.mark.asyncio
    async def test_returns_sub_id_from_table(self):
        key = "pk_test123"
        key_hash = hash_api_key(key)
        table_client = FakeTableClient({("key", key_hash): {"sub_id": "sub_1"}})
        table_svc = FakeTableService({"GwApiKeys": table_client})
        redis = FakeRedis()

        result = await resolve_api_key(key, table_svc, redis)
        assert result == "sub_1"

    @pytest.mark.asyncio
    async def test_caches_in_redis(self):
        key = "pk_test123"
        key_hash = hash_api_key(key)
        table_client = FakeTableClient({("key", key_hash): {"sub_id": "sub_1"}})
        table_svc = FakeTableService({"GwApiKeys": table_client})
        redis = FakeRedis()

        await resolve_api_key(key, table_svc, redis)
        cached = await redis.get(f"apikey:{key_hash}:sub_id")
        assert cached == "sub_1"

    @pytest.mark.asyncio
    async def test_reads_from_cache(self):
        key = "pk_test123"
        key_hash = hash_api_key(key)
        redis = FakeRedis()
        redis.seed(f"apikey:{key_hash}:sub_id", "sub_cached")
        table_svc = FakeTableService()  # empty — should not be hit

        result = await resolve_api_key(key, table_svc, redis)
        assert result == "sub_cached"

    @pytest.mark.asyncio
    async def test_returns_none_for_unknown_key(self):
        redis = FakeRedis()
        table_svc = FakeTableService()

        result = await resolve_api_key("unknown_key", table_svc, redis)
        assert result is None
