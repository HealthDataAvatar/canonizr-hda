"""Unit tests for TableUserResolver's cache-aside helpers (Redis only, no table)."""

import pytest

from app.user_resolver import CACHE_TTL, TableUserResolver
from tests.fakes import FakeRedis


def _resolver() -> tuple[TableUserResolver, FakeRedis]:
    r = FakeRedis()
    return TableUserResolver(r, table_service=None), r  # type: ignore[arg-type]  # helpers never touch the table


class TestCachedStr:
    @pytest.mark.asyncio
    async def test_miss_loads_and_caches(self):
        res, r = _resolver()
        calls = []

        def loader():
            calls.append(1)
            return "user_42"

        assert await res._cached_str("ck", loader) == "user_42"
        assert r._data["ck"] == "user_42"
        assert r._ttls["ck"] == CACHE_TTL
        # Second read hits cache — loader not called again.
        assert await res._cached_str("ck", loader) == "user_42"
        assert len(calls) == 1

    @pytest.mark.asyncio
    async def test_not_found_is_not_cached(self):
        res, r = _resolver()
        assert await res._cached_str("ck", lambda: None) is None
        assert "ck" not in r._data


class TestCachedNum:
    @pytest.mark.asyncio
    async def test_casts_and_caches_found_value(self):
        res, r = _resolver()
        assert await res._cached_num("ck", lambda: "0.002", default=0.003, cast=float) == 0.002
        assert r._data["ck"] == "0.002"

    @pytest.mark.asyncio
    async def test_default_is_cached_when_missing(self):
        res, r = _resolver()
        # Missing config -> default applied AND cached (so the lookup isn't retried).
        assert await res._cached_num("ck", lambda: None, default=1, cast=int) == 1
        assert r._data["ck"] == "1"

    @pytest.mark.asyncio
    async def test_zero_value_round_trips(self):
        # A cached "0" is valid (not a miss) — must not fall back to the default.
        res, r = _resolver()
        r.seed("ck", "0")
        assert await res._cached_num("ck", lambda: pytest.fail("loader should not run"), default=5, cast=int) == 0
