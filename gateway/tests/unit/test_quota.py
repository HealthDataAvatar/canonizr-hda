"""Unit tests for QuotaService — uses shared FakeRedis."""

from unittest.mock import patch

import pytest

from app.keys import account_usage, quota_limit, quota_rejected, quota_usage
from app.protocols import UserContext
from app.quota import SENTINEL_NONE, QuotaService, current_period_start
from tests.fakes import FakeRedis

ANCHOR = 1
PS = current_period_start(ANCHOR)


def ctx(user_id="u1", *, free_bytes=None, paid_enabled=False, cap_bytes=None, comp=False):
    """Build a UserContext for quota checks. Defaults: no free gate, no cap."""
    return UserContext(
        user_id=user_id,
        encryption_key=b"\x00" * 32,
        price_per_unit=0.003,
        billing_anchor_day=ANCHOR,
        free_bytes=free_bytes,
        paid_enabled=paid_enabled,
        cap_bytes=cap_bytes,
        comp=comp,
    )


class TestCompBypass:
    @pytest.mark.asyncio
    async def test_comp_user_bypasses_free_line_and_cap(self, svc):
        # Would be rejected for both free line and cap if not comp.
        user = ctx(free_bytes=10, cap_bytes=10, comp=True)
        assert await svc.check(user, "key-1", 1_000_000) is None


@pytest.fixture
def fake_redis():
    return FakeRedis()


@pytest.fixture
def svc(fake_redis):
    return QuotaService(fake_redis, rejected_ttl=3600, max_rejected=3)


class TestPerKeyQuota:
    @pytest.mark.asyncio
    async def test_no_quota_set_allows(self, svc):
        assert await svc.check(ctx(), "sub1", 100_000) is None

    @pytest.mark.asyncio
    async def test_under_quota_allows(self, svc, fake_redis):
        fake_redis.seed(quota_limit(sub_id="sub1"), 1_000_000)
        fake_redis.seed(quota_usage(sub_id="sub1", period_start=PS), 500_000)
        assert await svc.check(ctx(), "sub1", 100_000) is None

    @pytest.mark.asyncio
    async def test_at_quota_rejects_as_quota_exceeded(self, svc, fake_redis):
        fake_redis.seed(quota_limit(sub_id="sub1"), 1_000_000)
        fake_redis.seed(quota_usage(sub_id="sub1", period_start=PS), 1_000_000)
        r = await svc.check(ctx(), "sub1", 1)
        assert r is not None
        assert r.code == "quota_exceeded"
        assert r.status == 429

    @pytest.mark.asyncio
    async def test_file_too_large_for_remaining_rejects(self, svc, fake_redis):
        fake_redis.seed(quota_limit(sub_id="sub1"), 1_000_000)
        fake_redis.seed(quota_usage(sub_id="sub1", period_start=PS), 900_000)
        r = await svc.check(ctx(), "sub1", 200_000)
        assert r is not None and r.code == "quota_exceeded"

    @pytest.mark.asyncio
    async def test_file_exactly_fills_remaining_allows(self, svc, fake_redis):
        fake_redis.seed(quota_limit(sub_id="sub1"), 1_000_000)
        fake_redis.seed(quota_usage(sub_id="sub1", period_start=PS), 900_000)
        assert await svc.check(ctx(), "sub1", 100_000) is None

    @pytest.mark.asyncio
    async def test_rejection_increments_counter(self, svc, fake_redis):
        fake_redis.seed(quota_limit(sub_id="sub1"), 100)
        fake_redis.seed(quota_usage(sub_id="sub1", period_start=PS), 100)
        await svc.check(ctx(), "sub1", 1)
        assert fake_redis._data.get(quota_rejected(sub_id="sub1")) == "1"


class TestFreeLineGate:
    @pytest.mark.asyncio
    async def test_under_free_line_allows(self, svc, fake_redis):
        fake_redis.seed(account_usage(user_id="u1", period_start=PS), 40_000)
        assert await svc.check(ctx(free_bytes=100_000), "sub1", 50_000) is None

    @pytest.mark.asyncio
    async def test_crossing_free_line_blocks_with_402(self, svc, fake_redis):
        fake_redis.seed(account_usage(user_id="u1", period_start=PS), 90_000)
        r = await svc.check(ctx(free_bytes=100_000), "sub1", 50_000)
        assert r is not None
        assert r.status == 402
        assert r.code == "payment_required"

    @pytest.mark.asyncio
    async def test_paid_enabled_passes_free_line(self, svc, fake_redis):
        fake_redis.seed(account_usage(user_id="u1", period_start=PS), 90_000)
        assert await svc.check(ctx(free_bytes=100_000, paid_enabled=True), "sub1", 50_000) is None

    @pytest.mark.asyncio
    async def test_none_free_bytes_never_gates(self, svc, fake_redis):
        fake_redis.seed(account_usage(user_id="u1", period_start=PS), 10_000_000)
        assert await svc.check(ctx(free_bytes=None), "sub1", 50_000) is None


class TestAccountCap:
    @pytest.mark.asyncio
    async def test_account_cap_blocks_with_quota_exceeded(self, svc, fake_redis):
        fake_redis.seed(account_usage(user_id="u1", period_start=PS), 90_000)
        r = await svc.check(ctx(paid_enabled=True, cap_bytes=100_000), "sub1", 50_000)
        assert r is not None
        assert r.status == 429
        assert r.code == "quota_exceeded"

    @pytest.mark.asyncio
    async def test_under_cap_allows(self, svc, fake_redis):
        fake_redis.seed(account_usage(user_id="u1", period_start=PS), 40_000)
        assert await svc.check(ctx(paid_enabled=True, cap_bytes=100_000), "sub1", 50_000) is None

    @pytest.mark.asyncio
    async def test_account_usage_sums_across_keys(self, svc, fake_redis):
        # Two keys' charges both land in the same account counter.
        await svc.record("subA", "u1", 60_000, PS, ANCHOR)
        await svc.record("subB", "u1", 60_000, PS, ANCHOR)
        # Account total 120k > cap 100k → blocked even though neither key alone exceeds.
        r = await svc.check(ctx(paid_enabled=True, cap_bytes=100_000), "subA", 1)
        assert r is not None and r.code == "quota_exceeded"


class TestRateLimited:
    @pytest.mark.asyncio
    async def test_too_many_rejections_is_rate_limited(self, svc, fake_redis):
        fake_redis.seed(quota_rejected(sub_id="sub1"), 3)
        r = await svc.check(ctx(), "sub1", 1)
        assert r is not None
        assert r.code == "rate_limited"
        assert r.status == 429

    @pytest.mark.asyncio
    async def test_rate_limit_fires_before_other_checks(self, svc, fake_redis):
        fake_redis.seed(quota_rejected(sub_id="sub1"), 3)
        # Even with a free gate that would 402, the rate-limit wins.
        r = await svc.check(ctx(free_bytes=1), "sub1", 1000)
        assert r.code == "rate_limited"

    @pytest.mark.asyncio
    async def test_just_under_threshold_still_checks(self, svc, fake_redis):
        fake_redis.seed(quota_rejected(sub_id="sub1"), 2)
        assert await svc.check(ctx(), "sub1", 1) is None


class TestRecordAndRefund:
    @pytest.mark.asyncio
    async def test_record_increments_both_counters(self, svc, fake_redis):
        await svc.record("sub1", "u1", 50_000, PS, ANCHOR)
        assert fake_redis._data[quota_usage(sub_id="sub1", period_start=PS)] == "50000"
        assert fake_redis._data[account_usage(user_id="u1", period_start=PS)] == "50000"

    @pytest.mark.asyncio
    async def test_refund_decrements_both_counters(self, svc, fake_redis):
        await svc.record("sub1", "u1", 50_000, PS, ANCHOR)
        await svc.refund("sub1", "u1", 20_000, PS, ANCHOR)
        assert fake_redis._data[quota_usage(sub_id="sub1", period_start=PS)] == "30000"
        assert fake_redis._data[account_usage(user_id="u1", period_start=PS)] == "30000"

    @pytest.mark.asyncio
    async def test_record_sets_ttl(self, svc, fake_redis):
        await svc.record("sub1", "u1", 1000, PS, ANCHOR)
        assert fake_redis._ttls[quota_usage(sub_id="sub1", period_start=PS)] > 0
        assert fake_redis._ttls[account_usage(user_id="u1", period_start=PS)] > 0


class TestPerKeyCacheMissFallback:
    @pytest.mark.asyncio
    async def test_table_has_quota_loads_and_caches(self, svc, fake_redis):
        with patch.object(svc, "_lookup_quota_from_table", return_value=500_000):
            assert await svc.check(ctx(), "sub1", 100_000) is None
        assert fake_redis._data[quota_limit(sub_id="sub1")] == "500000"

    @pytest.mark.asyncio
    async def test_table_has_no_quota_caches_sentinel(self, svc, fake_redis):
        with patch.object(svc, "_lookup_quota_from_table", return_value=None):
            assert await svc.check(ctx(), "sub1", 100_000) is None
        assert fake_redis._data[quota_limit(sub_id="sub1")] == SENTINEL_NONE

    @pytest.mark.asyncio
    async def test_table_quota_enforced_on_cache_miss(self, svc, fake_redis):
        with patch.object(svc, "_lookup_quota_from_table", return_value=100):
            r = await svc.check(ctx(), "sub1", 200)
        assert r is not None and r.code == "quota_exceeded"


class TestUsageReconstructionFromTable:
    def test_reconstructs_per_key_and_account(self, fake_redis):
        """Per-key filters by sub_id; account filters by user_id. Same dedup/period rules."""
        from unittest.mock import MagicMock

        svc = QuotaService(fake_redis, rejected_ttl=3600, max_rejected=3)
        jobs = [
            {
                "job_id": "j1",
                "sub_id": "subA",
                "user_id": "u1",
                "status": "ok",
                "input_bytes": 50_000,
                "completed_at": "2026-06-05T10:00:00Z",
            },
            {
                "job_id": "j1",
                "sub_id": "subA",
                "user_id": "u1",
                "status": "ok",
                "input_bytes": 50_000,
                "completed_at": "2026-06-05T10:00:00Z",
            },  # dup
            {
                "job_id": "j2",
                "sub_id": "subB",
                "user_id": "u1",
                "status": "ok",
                "input_bytes": 30_000,
                "completed_at": "2026-06-10T12:00:00Z",
            },
            {
                "job_id": "j3",
                "sub_id": "subA",
                "user_id": "u1",
                "status": "error",
                "input_bytes": 99_000,
                "completed_at": "2026-06-06T09:00:00Z",
            },
            {
                "job_id": "j4",
                "sub_id": "subZ",
                "user_id": "u2",
                "status": "ok",
                "input_bytes": 200_000,
                "completed_at": "2026-06-08T11:00:00Z",
            },
        ]

        def fake_query(filter_expr):
            for j in jobs:
                if (
                    f"sub_id eq '{j['sub_id']}'" not in filter_expr
                    and f"user_id eq '{j['user_id']}'" not in filter_expr
                ):
                    continue
                if j["status"] != "ok":
                    continue
                yield j

        mock_ts, mock_table = MagicMock(), MagicMock()
        mock_ts.get_table_client.return_value = mock_table
        mock_table.query_entities.side_effect = fake_query
        svc._ts = mock_ts

        # Per-key subA: only j1 (50k), dup deduped, j3 error excluded.
        assert svc._reconstruct_usage_from_table("subA", "2026-06-01") == 50_000
        # Account u1: j1 (50k) + j2 (30k) = 80k across both keys; u2 excluded.
        assert svc._reconstruct_account_usage_from_table("u1", "2026-06-01") == 80_000

    @pytest.mark.asyncio
    async def test_account_cache_miss_reconstructs_and_seeds(self, fake_redis):
        svc = QuotaService(fake_redis, rejected_ttl=3600, max_rejected=3)
        with patch.object(svc, "_reconstruct_account_usage_from_table", return_value=42_000) as m:
            r = await svc.check(ctx(paid_enabled=True, cap_bytes=1_000_000), "sub1", 1)
        m.assert_called_once_with("u1", PS)
        assert r is None
        assert fake_redis._data[account_usage(user_id="u1", period_start=PS)] == "42000"


class TestCurrentPeriodStart:
    def test_anchor_day_31_in_short_month(self):
        from datetime import date

        assert current_period_start(31, now=date(2026, 2, 15)) == "2026-01-31"

    def test_after_anchor_returns_current_month(self):
        from datetime import date

        assert current_period_start(15, now=date(2026, 6, 20)) == "2026-06-15"

    def test_before_anchor_returns_previous_month(self):
        from datetime import date

        assert current_period_start(15, now=date(2026, 6, 10)) == "2026-05-15"

    def test_january_before_anchor_wraps_to_december(self):
        from datetime import date

        assert current_period_start(20, now=date(2026, 1, 5)) == "2025-12-20"
