"""Unit tests for QuotaService — uses shared FakeRedis."""

from unittest.mock import patch

import pytest

from app.keys import quota_limit, quota_rejected, quota_usage
from app.quota import SENTINEL_NONE, QuotaService, current_period_start
from tests.fakes import FakeRedis


@pytest.fixture
def fake_redis():
    return FakeRedis()


@pytest.fixture
def svc(fake_redis):
    return QuotaService(fake_redis, rejected_ttl=3600, max_rejected=3)


# Use a fixed anchor day for deterministic tests
ANCHOR = 1
PS = current_period_start(ANCHOR)


class TestCheck:
    @pytest.mark.asyncio
    async def test_no_quota_set_allows(self, svc):
        result = await svc.check("sub1", 100_000, ANCHOR)
        assert result is None

    @pytest.mark.asyncio
    async def test_under_quota_allows(self, svc, fake_redis):
        fake_redis.seed(quota_limit(sub_id="sub1"), 1_000_000)
        fake_redis.seed(quota_usage(sub_id="sub1", period_start=PS), 500_000)
        result = await svc.check("sub1", 100_000, ANCHOR)
        assert result is None

    @pytest.mark.asyncio
    async def test_at_quota_rejects(self, svc, fake_redis):
        fake_redis.seed(quota_limit(sub_id="sub1"), 1_000_000)
        fake_redis.seed(quota_usage(sub_id="sub1", period_start=PS), 1_000_000)
        result = await svc.check("sub1", 1, ANCHOR)
        assert result is not None
        assert "Quota exceeded" in result

    @pytest.mark.asyncio
    async def test_over_quota_rejects(self, svc, fake_redis):
        fake_redis.seed(quota_limit(sub_id="sub1"), 1_000_000)
        fake_redis.seed(quota_usage(sub_id="sub1", period_start=PS), 1_500_000)
        result = await svc.check("sub1", 1, ANCHOR)
        assert result is not None
        assert "Quota exceeded" in result

    @pytest.mark.asyncio
    async def test_file_too_large_for_remaining(self, svc, fake_redis):
        fake_redis.seed(quota_limit(sub_id="sub1"), 1_000_000)
        fake_redis.seed(quota_usage(sub_id="sub1", period_start=PS), 900_000)
        result = await svc.check("sub1", 200_000, ANCHOR)
        assert result is not None
        assert "File too large" in result

    @pytest.mark.asyncio
    async def test_file_exactly_fills_remaining(self, svc, fake_redis):
        fake_redis.seed(quota_limit(sub_id="sub1"), 1_000_000)
        fake_redis.seed(quota_usage(sub_id="sub1", period_start=PS), 900_000)
        result = await svc.check("sub1", 100_000, ANCHOR)
        assert result is None

    @pytest.mark.asyncio
    async def test_zero_usage_allows(self, svc, fake_redis):
        fake_redis.seed(quota_limit(sub_id="sub1"), 1_000_000)
        result = await svc.check("sub1", 100_000, ANCHOR)
        assert result is None

    @pytest.mark.asyncio
    async def test_rejection_increments_counter(self, svc, fake_redis):
        fake_redis.seed(quota_limit(sub_id="sub1"), 100)
        fake_redis.seed(quota_usage(sub_id="sub1", period_start=PS), 100)
        await svc.check("sub1", 1, ANCHOR)
        assert fake_redis._data.get(quota_rejected(sub_id="sub1")) == "1"

    @pytest.mark.asyncio
    async def test_rejection_sets_ttl(self, svc, fake_redis):
        fake_redis.seed(quota_limit(sub_id="sub1"), 100)
        fake_redis.seed(quota_usage(sub_id="sub1", period_start=PS), 100)
        await svc.check("sub1", 1, ANCHOR)
        assert fake_redis._ttls.get(quota_rejected(sub_id="sub1")) == 3600

    @pytest.mark.asyncio
    async def test_repeated_rejections_trigger_block(self, svc, fake_redis):
        fake_redis.seed(quota_rejected(sub_id="sub1"), 3)
        result = await svc.check("sub1", 1, ANCHOR)
        assert result is not None
        assert "Too many rejected" in result

    @pytest.mark.asyncio
    async def test_block_fires_before_quota_check(self, svc, fake_redis):
        fake_redis.seed(quota_rejected(sub_id="sub1"), 3)
        result = await svc.check("sub1", 1, ANCHOR)
        assert "Too many rejected" in result

    @pytest.mark.asyncio
    async def test_just_under_block_threshold_still_checks(self, svc, fake_redis):
        fake_redis.seed(quota_rejected(sub_id="sub1"), 2)
        result = await svc.check("sub1", 1, ANCHOR)
        assert result is None


class TestRecord:
    @pytest.mark.asyncio
    async def test_increments_usage(self, svc, fake_redis):
        await svc.record("sub1", 50_000, ANCHOR)
        key = quota_usage(sub_id="sub1", period_start=PS)
        assert fake_redis._data[key] == "50000"

    @pytest.mark.asyncio
    async def test_accumulates_usage(self, svc, fake_redis):
        await svc.record("sub1", 50_000, ANCHOR)
        await svc.record("sub1", 30_000, ANCHOR)
        key = quota_usage(sub_id="sub1", period_start=PS)
        assert fake_redis._data[key] == "80000"

    @pytest.mark.asyncio
    async def test_sets_ttl(self, svc, fake_redis):
        await svc.record("sub1", 1000, ANCHOR)
        key = quota_usage(sub_id="sub1", period_start=PS)
        assert fake_redis._ttls[key] > 0

    @pytest.mark.asyncio
    async def test_separate_subscriptions(self, svc, fake_redis):
        await svc.record("sub1", 100, ANCHOR)
        await svc.record("sub2", 200, ANCHOR)
        assert fake_redis._data[quota_usage(sub_id="sub1", period_start=PS)] == "100"
        assert fake_redis._data[quota_usage(sub_id="sub2", period_start=PS)] == "200"


class TestRefund:
    @pytest.mark.asyncio
    async def test_decrements_usage(self, svc, fake_redis):
        await svc.record("sub1", 50_000, ANCHOR)
        await svc.refund("sub1", 50_000, ANCHOR)
        key = quota_usage(sub_id="sub1", period_start=PS)
        assert fake_redis._data[key] == "0"

    @pytest.mark.asyncio
    async def test_partial_refund(self, svc, fake_redis):
        await svc.record("sub1", 50_000, ANCHOR)
        await svc.refund("sub1", 20_000, ANCHOR)
        key = quota_usage(sub_id="sub1", period_start=PS)
        assert fake_redis._data[key] == "30000"


class TestCacheMissFallback:
    @pytest.mark.asyncio
    async def test_table_has_quota_loads_and_caches(self, fake_redis):
        svc = QuotaService(fake_redis, rejected_ttl=3600, max_rejected=3)
        with patch.object(svc, "_lookup_quota_from_table", return_value=500_000):
            result = await svc.check("sub1", 100_000, ANCHOR)
        assert result is None
        # Should be cached in Redis now
        assert fake_redis._data[quota_limit(sub_id="sub1")] == "500000"

    @pytest.mark.asyncio
    async def test_table_has_no_quota_caches_sentinel(self, fake_redis):
        svc = QuotaService(fake_redis, rejected_ttl=3600, max_rejected=3)
        with patch.object(svc, "_lookup_quota_from_table", return_value=None):
            result = await svc.check("sub1", 100_000, ANCHOR)
        assert result is None
        assert fake_redis._data[quota_limit(sub_id="sub1")] == SENTINEL_NONE

    @pytest.mark.asyncio
    async def test_cached_value_skips_table(self, fake_redis):
        svc = QuotaService(fake_redis, rejected_ttl=3600, max_rejected=3)
        fake_redis.seed(quota_limit(sub_id="sub1"), 500_000)
        with patch.object(svc, "_lookup_quota_from_table") as mock_lookup:
            result = await svc.check("sub1", 100_000, ANCHOR)
        mock_lookup.assert_not_called()
        assert result is None

    @pytest.mark.asyncio
    async def test_sentinel_none_allows_without_table(self, fake_redis):
        svc = QuotaService(fake_redis, rejected_ttl=3600, max_rejected=3)
        fake_redis.seed(quota_limit(sub_id="sub1"), SENTINEL_NONE)
        with patch.object(svc, "_lookup_quota_from_table") as mock_lookup:
            result = await svc.check("sub1", 100_000, ANCHOR)
        mock_lookup.assert_not_called()
        assert result is None

    @pytest.mark.asyncio
    async def test_table_quota_enforced_on_cache_miss(self, fake_redis):
        svc = QuotaService(fake_redis, rejected_ttl=3600, max_rejected=3)
        with patch.object(svc, "_lookup_quota_from_table", return_value=100):
            result = await svc.check("sub1", 200, ANCHOR)
        assert result is not None
        assert "File too large" in result


class TestAnchorDayQuotaCycle:
    """Verify period start computation with different anchor days and dates."""

    def test_anchor_15_on_june_20(self):
        from datetime import date

        ps = current_period_start(15, now=date(2026, 6, 20))
        assert ps == "2026-06-15"

    def test_anchor_15_on_june_10_uses_previous_month(self):
        from datetime import date

        ps = current_period_start(15, now=date(2026, 6, 10))
        assert ps == "2026-05-15"

    def test_period_boundary_resets_usage(self, fake_redis):
        """Usage in last period doesn't count against this period's quota.

        Anchor=15. Old period key (2026-05-15) has 100 bytes (quota full).
        New period key (2026-06-15) doesn't exist → usage is 0 → allowed.
        """
        from datetime import date

        fake_redis.seed(quota_limit(sub_id="sub1"), 100)
        old_key = quota_usage(sub_id="sub1", period_start="2026-05-15")
        fake_redis.seed(old_key, 100)

        # June 20, anchor=15 → period 2026-06-15, no usage key → 0
        ps = current_period_start(15, now=date(2026, 6, 20))
        assert ps == "2026-06-15"
        new_key = quota_usage(sub_id="sub1", period_start=ps)
        assert fake_redis._data.get(new_key) is None  # no usage in new period


class TestUsageReconstructionFromTable:
    """Verify that on Redis cache miss, usage is reconstructed from GwJobs."""

    @pytest.mark.asyncio
    async def test_reconstructs_sparse_history(self, fake_redis):
        """Mix of statuses, duplicates, and zero-byte jobs — only ok jobs with
        input_bytes > 0 should be counted, and duplicates deduped."""
        svc = QuotaService(fake_redis, rejected_ttl=3600, max_rejected=3)
        fake_redis.seed(quota_limit(sub_id="sub1"), 1_000_000)

        jobs = [
            # Two ok jobs with real bytes
            {
                "PartitionKey": "job_a1",
                "RowKey": "j1_001_x",
                "job_id": "j1",
                "sub_id": "sub1",
                "status": "ok",
                "input_bytes": 50_000,
                "completed_at": "2026-06-05T10:00:00Z",
            },
            {
                "PartitionKey": "job_a2",
                "RowKey": "j2_002_x",
                "job_id": "j2",
                "sub_id": "sub1",
                "status": "ok",
                "input_bytes": 30_000,
                "completed_at": "2026-06-10T12:00:00Z",
            },
            # Duplicate row for j1 (append-only table, different RowKey)
            {
                "PartitionKey": "job_a1",
                "RowKey": "j1_003_y",
                "job_id": "j1",
                "sub_id": "sub1",
                "status": "ok",
                "input_bytes": 50_000,
                "completed_at": "2026-06-05T10:00:00Z",
            },
            # Error job — should not count
            {
                "PartitionKey": "job_b3",
                "RowKey": "j3_004_x",
                "job_id": "j3",
                "sub_id": "sub1",
                "status": "error",
                "input_bytes": 100_000,
                "completed_at": "2026-06-06T09:00:00Z",
            },
            # Ok job with 0 bytes — should not count
            {
                "PartitionKey": "job_c4",
                "RowKey": "j4_005_x",
                "job_id": "j4",
                "sub_id": "sub1",
                "status": "ok",
                "input_bytes": 0,
                "completed_at": "2026-06-07T08:00:00Z",
            },
            # Different sub_id — should not count
            {
                "PartitionKey": "job_d5",
                "RowKey": "j5_006_x",
                "job_id": "j5",
                "sub_id": "sub2",
                "status": "ok",
                "input_bytes": 200_000,
                "completed_at": "2026-06-08T11:00:00Z",
            },
            # Before period start — should not count
            {
                "PartitionKey": "job_e6",
                "RowKey": "j6_007_x",
                "job_id": "j6",
                "sub_id": "sub1",
                "status": "ok",
                "input_bytes": 75_000,
                "completed_at": "2026-05-25T14:00:00Z",
            },
        ]

        result = svc._reconstruct_usage_from_table("sub1", "2026-06-01")
        # Without table_service, returns 0
        assert result == 0

        # Now mock the table service
        from unittest.mock import MagicMock

        mock_ts = MagicMock()
        mock_table = MagicMock()
        mock_ts.get_table_client.return_value = mock_table

        def fake_query(filter_expr):
            """Simulate server-side filtering."""
            for j in jobs:
                # Check sub_id
                if f"sub_id eq '{j['sub_id']}'" not in filter_expr:
                    continue
                if j["status"] != "ok":
                    continue
                # Check completed_at >= period_start
                if "completed_at ge '2026-06-01T00:00:00Z'" in filter_expr:
                    if str(j["completed_at"]) < "2026-06-01T00:00:00Z":
                        continue
                yield j

        mock_table.query_entities.side_effect = fake_query
        svc._ts = mock_ts

        result = svc._reconstruct_usage_from_table("sub1", "2026-06-01")
        # j1: 50_000 + j2: 30_000 + j4: 0 (ok but 0 bytes) = 80_000
        # j1 duplicate deduped, j3 error excluded, j5 wrong sub, j6 before period
        assert result == 80_000

    @pytest.mark.asyncio
    async def test_cache_miss_triggers_reconstruction_and_seeds_redis(self, fake_redis):
        """When Redis has no usage key, check() should reconstruct and seed."""
        from unittest.mock import patch

        svc = QuotaService(fake_redis, rejected_ttl=3600, max_rejected=3)
        fake_redis.seed(quota_limit(sub_id="sub1"), 1_000_000)
        # No usage key in Redis — triggers reconstruction

        with patch.object(svc, "_reconstruct_usage_from_table", return_value=42_000) as mock_recon:
            result = await svc.check("sub1", 1, ANCHOR)

        mock_recon.assert_called_once_with("sub1", PS)
        assert result is None  # 42_000 < 1_000_000, allowed

        # Redis should now have the reconstructed value
        key = quota_usage(sub_id="sub1", period_start=PS)
        assert fake_redis._data[key] == "42000"

    @pytest.mark.asyncio
    async def test_cache_hit_skips_reconstruction(self, fake_redis):
        """When Redis has a usage key (even 0), don't reconstruct."""
        from unittest.mock import patch

        svc = QuotaService(fake_redis, rejected_ttl=3600, max_rejected=3)
        fake_redis.seed(quota_limit(sub_id="sub1"), 1_000_000)
        fake_redis.seed(quota_usage(sub_id="sub1", period_start=PS), 0)

        with patch.object(svc, "_reconstruct_usage_from_table") as mock_recon:
            result = await svc.check("sub1", 1, ANCHOR)

        mock_recon.assert_not_called()
        assert result is None


class TestCurrentPeriodStart:
    def test_anchor_day_1(self):
        """Anchor day 1 always returns the 1st of the current or previous month."""
        from datetime import date

        result = current_period_start(1)
        d = date.fromisoformat(result)
        assert d.day == 1

    def test_anchor_day_31_in_short_month(self):
        """Anchor day 31 in Feb → clamps to Jan 31."""
        from datetime import date

        assert current_period_start(31, now=date(2026, 2, 15)) == "2026-01-31"

    def test_anchor_day_31_in_feb_clamps_period(self):
        """Anchor day 31 on March 5 → period started Feb 28 (clamped)."""
        from datetime import date

        assert current_period_start(31, now=date(2026, 3, 5)) == "2026-02-28"

    def test_after_anchor_returns_current_month(self):
        from datetime import date

        assert current_period_start(15, now=date(2026, 6, 20)) == "2026-06-15"

    def test_before_anchor_returns_previous_month(self):
        from datetime import date

        assert current_period_start(15, now=date(2026, 6, 10)) == "2026-05-15"

    def test_on_anchor_day_returns_current_month(self):
        from datetime import date

        assert current_period_start(15, now=date(2026, 6, 15)) == "2026-06-15"

    def test_january_before_anchor_wraps_to_december(self):
        from datetime import date

        assert current_period_start(20, now=date(2026, 1, 5)) == "2025-12-20"

    def test_december_after_anchor(self):
        from datetime import date

        assert current_period_start(10, now=date(2026, 12, 25)) == "2026-12-10"
