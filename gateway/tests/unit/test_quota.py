"""Unit tests for QuotaService — uses shared FakeRedis."""

from unittest.mock import patch

import pytest

from app.keys import quota_limit, quota_rejected, quota_usage
from app.quota import SENTINEL_NONE, QuotaService
from tests.fakes import FakeRedis


@pytest.fixture
def fake_redis():
    return FakeRedis()


@pytest.fixture
def svc(fake_redis):
    return QuotaService(fake_redis, rejected_ttl=3600, max_rejected=3)


class TestCheck:
    @pytest.mark.asyncio
    async def test_no_quota_set_allows(self, svc):
        result = await svc.check("sub1", 100_000)
        assert result is None

    @pytest.mark.asyncio
    async def test_under_quota_allows(self, svc, fake_redis):
        fake_redis.seed(quota_limit(sub_id="sub1"), 1_000_000)
        fake_redis.seed(quota_usage(sub_id="sub1"), 500_000)
        result = await svc.check("sub1", 100_000)
        assert result is None

    @pytest.mark.asyncio
    async def test_at_quota_rejects(self, svc, fake_redis):
        fake_redis.seed(quota_limit(sub_id="sub1"), 1_000_000)
        fake_redis.seed(quota_usage(sub_id="sub1"), 1_000_000)
        result = await svc.check("sub1", 1)
        assert result is not None
        assert "Quota exceeded" in result

    @pytest.mark.asyncio
    async def test_over_quota_rejects(self, svc, fake_redis):
        fake_redis.seed(quota_limit(sub_id="sub1"), 1_000_000)
        fake_redis.seed(quota_usage(sub_id="sub1"), 1_500_000)
        result = await svc.check("sub1", 1)
        assert result is not None
        assert "Quota exceeded" in result

    @pytest.mark.asyncio
    async def test_file_too_large_for_remaining(self, svc, fake_redis):
        fake_redis.seed(quota_limit(sub_id="sub1"), 1_000_000)
        fake_redis.seed(quota_usage(sub_id="sub1"), 900_000)
        result = await svc.check("sub1", 200_000)
        assert result is not None
        assert "File too large" in result

    @pytest.mark.asyncio
    async def test_file_exactly_fills_remaining(self, svc, fake_redis):
        fake_redis.seed(quota_limit(sub_id="sub1"), 1_000_000)
        fake_redis.seed(quota_usage(sub_id="sub1"), 900_000)
        result = await svc.check("sub1", 100_000)
        assert result is None

    @pytest.mark.asyncio
    async def test_zero_usage_allows(self, svc, fake_redis):
        fake_redis.seed(quota_limit(sub_id="sub1"), 1_000_000)
        result = await svc.check("sub1", 100_000)
        assert result is None

    @pytest.mark.asyncio
    async def test_rejection_increments_counter(self, svc, fake_redis):
        fake_redis.seed(quota_limit(sub_id="sub1"), 100)
        fake_redis.seed(quota_usage(sub_id="sub1"), 100)
        await svc.check("sub1", 1)
        assert fake_redis._data.get(quota_rejected(sub_id="sub1")) == "1"

    @pytest.mark.asyncio
    async def test_rejection_sets_ttl(self, svc, fake_redis):
        fake_redis.seed(quota_limit(sub_id="sub1"), 100)
        fake_redis.seed(quota_usage(sub_id="sub1"), 100)
        await svc.check("sub1", 1)
        assert fake_redis._ttls.get(quota_rejected(sub_id="sub1")) == 3600

    @pytest.mark.asyncio
    async def test_repeated_rejections_trigger_block(self, svc, fake_redis):
        fake_redis.seed(quota_rejected(sub_id="sub1"), 3)
        result = await svc.check("sub1", 1)
        assert result is not None
        assert "Too many rejected" in result

    @pytest.mark.asyncio
    async def test_block_fires_before_quota_check(self, svc, fake_redis):
        fake_redis.seed(quota_rejected(sub_id="sub1"), 3)
        result = await svc.check("sub1", 1)
        assert "Too many rejected" in result

    @pytest.mark.asyncio
    async def test_just_under_block_threshold_still_checks(self, svc, fake_redis):
        fake_redis.seed(quota_rejected(sub_id="sub1"), 2)
        result = await svc.check("sub1", 1)
        assert result is None


class TestRecord:
    @pytest.mark.asyncio
    async def test_increments_usage(self, svc, fake_redis):
        await svc.record("sub1", 50_000)
        assert fake_redis._data[quota_usage(sub_id="sub1")] == "50000"

    @pytest.mark.asyncio
    async def test_accumulates_usage(self, svc, fake_redis):
        await svc.record("sub1", 50_000)
        await svc.record("sub1", 30_000)
        assert fake_redis._data[quota_usage(sub_id="sub1")] == "80000"

    @pytest.mark.asyncio
    async def test_sets_ttl(self, svc, fake_redis):
        await svc.record("sub1", 1000)
        assert fake_redis._ttls[quota_usage(sub_id="sub1")] == 2_678_400

    @pytest.mark.asyncio
    async def test_custom_ttl(self, fake_redis):
        svc = QuotaService(fake_redis, billing_period_ttl=86400)
        await svc.record("sub1", 1000)
        assert fake_redis._ttls[quota_usage(sub_id="sub1")] == 86400

    @pytest.mark.asyncio
    async def test_separate_subscriptions(self, svc, fake_redis):
        await svc.record("sub1", 100)
        await svc.record("sub2", 200)
        assert fake_redis._data[quota_usage(sub_id="sub1")] == "100"
        assert fake_redis._data[quota_usage(sub_id="sub2")] == "200"


class TestRefund:
    @pytest.mark.asyncio
    async def test_decrements_usage(self, svc, fake_redis):
        await svc.record("sub1", 50_000)
        await svc.refund("sub1", 50_000)
        assert fake_redis._data[quota_usage(sub_id="sub1")] == "0"

    @pytest.mark.asyncio
    async def test_partial_refund(self, svc, fake_redis):
        await svc.record("sub1", 50_000)
        await svc.refund("sub1", 20_000)
        assert fake_redis._data[quota_usage(sub_id="sub1")] == "30000"


class TestCacheMissFallback:
    @pytest.mark.asyncio
    async def test_table_has_quota_loads_and_caches(self, fake_redis):
        svc = QuotaService(fake_redis, rejected_ttl=3600, max_rejected=3)
        with patch.object(svc, "_lookup_quota_from_table", return_value=500_000):
            result = await svc.check("sub1", 100_000)
        assert result is None
        # Should be cached in Redis now
        assert fake_redis._data[quota_limit(sub_id="sub1")] == "500000"

    @pytest.mark.asyncio
    async def test_table_has_no_quota_caches_sentinel(self, fake_redis):
        svc = QuotaService(fake_redis, rejected_ttl=3600, max_rejected=3)
        with patch.object(svc, "_lookup_quota_from_table", return_value=None):
            result = await svc.check("sub1", 100_000)
        assert result is None
        assert fake_redis._data[quota_limit(sub_id="sub1")] == SENTINEL_NONE

    @pytest.mark.asyncio
    async def test_cached_value_skips_table(self, fake_redis):
        svc = QuotaService(fake_redis, rejected_ttl=3600, max_rejected=3)
        fake_redis.seed(quota_limit(sub_id="sub1"), 500_000)
        with patch.object(svc, "_lookup_quota_from_table") as mock_lookup:
            result = await svc.check("sub1", 100_000)
        mock_lookup.assert_not_called()
        assert result is None

    @pytest.mark.asyncio
    async def test_sentinel_none_allows_without_table(self, fake_redis):
        svc = QuotaService(fake_redis, rejected_ttl=3600, max_rejected=3)
        fake_redis.seed(quota_limit(sub_id="sub1"), SENTINEL_NONE)
        with patch.object(svc, "_lookup_quota_from_table") as mock_lookup:
            result = await svc.check("sub1", 100_000)
        mock_lookup.assert_not_called()
        assert result is None

    @pytest.mark.asyncio
    async def test_table_quota_enforced_on_cache_miss(self, fake_redis):
        svc = QuotaService(fake_redis, rejected_ttl=3600, max_rejected=3)
        with patch.object(svc, "_lookup_quota_from_table", return_value=100):
            result = await svc.check("sub1", 200)
        assert result is not None
        assert "File too large" in result
