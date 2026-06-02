"""Unit tests for usage_report — mocks Azure and Stripe APIs."""

from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest

from app.usage_report import (
    ConfigError,
    ReporterConfig,
    UsageRecord,
    compute_window,
    push_meter_events,
    run,
)


def make_record(sub_id="sub1", doc_hash="hash1", size=100_000):
    return UsageRecord(sub_id, datetime(2025, 6, 1, 12, 0, 0, tzinfo=UTC), size, doc_hash, 200)


def make_config(
    log_analytics_workspace_id: str = "ws-123",
    stripe_secret_key: str = "sk_test_xxx",
) -> ReporterConfig:
    return ReporterConfig(
        log_analytics_workspace_id=log_analytics_workspace_id,
        stripe_secret_key=stripe_secret_key,
        table_service=MagicMock(),
    )


# ---------------------------------------------------------------------------
# ReporterConfig
# ---------------------------------------------------------------------------


class TestReporterConfig:
    @patch("app.usage_report.get_table_service", return_value=MagicMock())
    def test_from_env_with_all_vars(self, _mock_ts):
        env = {
            "LOG_ANALYTICS_WORKSPACE_ID": "ws-1",
            "STRIPE_SECRET_KEY": "sk_test_1",
        }
        with patch.dict("os.environ", env, clear=False):
            cfg = ReporterConfig.from_env()
        assert cfg.log_analytics_workspace_id == "ws-1"
        assert cfg.stripe_secret_key == "sk_test_1"

    def test_from_env_missing_vars_raises(self):
        with patch.dict("os.environ", {}, clear=True):
            with pytest.raises(ConfigError, match="LOG_ANALYTICS_WORKSPACE_ID"):
                ReporterConfig.from_env()

    def test_from_env_reports_all_missing(self):
        with patch.dict("os.environ", {}, clear=True):
            with pytest.raises(ConfigError) as exc_info:
                ReporterConfig.from_env()
            msg = str(exc_info.value)
            assert "LOG_ANALYTICS_WORKSPACE_ID" in msg
            assert "STRIPE_SECRET_KEY" in msg


# ---------------------------------------------------------------------------
# UsageRecord
# ---------------------------------------------------------------------------


class TestUsageRecord:
    def test_billable_units_rounds_up(self):
        r = UsageRecord("sub1", datetime.now(UTC), 1, "hash1", 200)
        assert r.billable_units == 1

    def test_billable_units_100kb(self):
        r = UsageRecord("sub1", datetime.now(UTC), 100_000, "hash1", 200)
        assert r.billable_units == 1

    def test_billable_units_100kb_plus_one(self):
        r = UsageRecord("sub1", datetime.now(UTC), 100_001, "hash1", 200)
        assert r.billable_units == 2

    def test_billable_units_large_file(self):
        r = UsageRecord("sub1", datetime.now(UTC), 2_100_000, "hash1", 200)
        assert r.billable_units == 21

    def test_event_identifier_deterministic(self):
        ts = datetime(2025, 6, 1, 12, 0, 0, tzinfo=UTC)
        r = UsageRecord("sub1", ts, 100_000, "abc123", 200)
        assert r.event_identifier == f"sub1:{int(ts.timestamp())}:abc123"

    def test_event_identifier_stable_across_calls(self):
        ts = datetime(2025, 6, 1, 12, 0, 0, tzinfo=UTC)
        r = UsageRecord("sub1", ts, 100_000, "abc123", 200)
        assert r.event_identifier == r.event_identifier


# ---------------------------------------------------------------------------
# compute_window
# ---------------------------------------------------------------------------


class TestComputeWindow:
    def test_uses_watermark_as_start(self):
        now = datetime(2025, 6, 1, 14, 0, 0, tzinfo=UTC)
        wm = datetime(2025, 6, 1, 13, 0, 0, tzinfo=UTC)
        start, end = compute_window(wm, now, ingestion_delay_minutes=10, max_window_hours=24)
        assert start == wm
        assert end == now - timedelta(minutes=10)

    def test_no_watermark_defaults_to_2_hours(self):
        now = datetime(2025, 6, 1, 14, 0, 0, tzinfo=UTC)
        start, end = compute_window(None, now, ingestion_delay_minutes=10, max_window_hours=24)
        assert start == end - timedelta(hours=2)

    def test_caps_window_to_max(self):
        now = datetime(2025, 6, 5, 14, 0, 0, tzinfo=UTC)
        wm = datetime(2025, 6, 1, 0, 0, 0, tzinfo=UTC)  # 4+ days ago
        start, end = compute_window(wm, now, ingestion_delay_minutes=10, max_window_hours=24)
        assert (end - start) == timedelta(hours=24)

    def test_ingestion_delay_applied(self):
        now = datetime(2025, 6, 1, 14, 0, 0, tzinfo=UTC)
        _, end = compute_window(None, now, ingestion_delay_minutes=15, max_window_hours=24)
        assert end == now - timedelta(minutes=15)

    def test_recent_watermark_produces_small_window(self):
        now = datetime(2025, 6, 1, 14, 0, 0, tzinfo=UTC)
        wm = datetime(2025, 6, 1, 13, 45, 0, tzinfo=UTC)
        start, end = compute_window(wm, now, ingestion_delay_minutes=10, max_window_hours=24)
        assert start == wm
        assert (end - start) == timedelta(minutes=5)

    def test_watermark_after_end_produces_empty_window(self):
        now = datetime(2025, 6, 1, 14, 0, 0, tzinfo=UTC)
        wm = datetime(2025, 6, 1, 14, 0, 0, tzinfo=UTC)  # same as now, after delay subtraction start >= end
        start, end = compute_window(wm, now, ingestion_delay_minutes=10, max_window_hours=24)
        assert start >= end


# ---------------------------------------------------------------------------
# push_meter_events
# ---------------------------------------------------------------------------


class TestPushMeterEvents:
    @patch("app.usage_report.stripe")
    def test_pushes_mapped_records(self, mock_stripe):
        records = [make_record("sub1", "h1"), make_record("sub1", "h2")]
        pushed, skipped = push_meter_events(records, {"sub1": "cus_abc"})
        assert pushed == 2
        assert skipped == 0
        assert mock_stripe.billing.MeterEvent.create.call_count == 2

    @patch("app.usage_report.stripe")
    def test_skips_unmapped_subscriptions(self, mock_stripe):
        records = [make_record("sub1"), make_record("sub_unknown")]
        pushed, skipped = push_meter_events(records, {"sub1": "cus_abc"})
        assert pushed == 1
        assert skipped == 1

    @patch("app.usage_report.stripe")
    def test_handles_duplicate_gracefully(self, mock_stripe):
        import stripe as real_stripe

        mock_stripe.InvalidRequestError = real_stripe.InvalidRequestError
        mock_stripe.billing.MeterEvent.create.side_effect = real_stripe.InvalidRequestError(
            "Event already exists", param=None
        )
        pushed, skipped = push_meter_events([make_record()], {"sub1": "cus_abc"})
        assert pushed == 1
        assert skipped == 0

    @patch("app.usage_report.stripe")
    def test_all_unmapped_returns_zero_pushed(self, mock_stripe):
        pushed, skipped = push_meter_events([make_record("unknown1"), make_record("unknown2")], {})
        assert pushed == 0
        assert skipped == 2

    @patch("app.usage_report.stripe")
    def test_stripe_error_skips_record(self, mock_stripe):
        import stripe as real_stripe

        mock_stripe.InvalidRequestError = real_stripe.InvalidRequestError
        mock_stripe.billing.MeterEvent.create.side_effect = real_stripe.InvalidRequestError(
            "Some other error", param=None
        )
        pushed, skipped = push_meter_events([make_record()], {"sub1": "cus_abc"})
        assert pushed == 0
        assert skipped == 1

    @patch("app.usage_report.stripe")
    def test_correct_payload_shape(self, mock_stripe):
        record = make_record()
        push_meter_events([record], {"sub1": "cus_abc"})
        call_kwargs = mock_stripe.billing.MeterEvent.create.call_args
        assert call_kwargs.kwargs["event_name"] == "conversion_bytes"
        assert call_kwargs.kwargs["payload"]["stripe_customer_id"] == "cus_abc"
        assert call_kwargs.kwargs["payload"]["value"] == "1"
        assert call_kwargs.kwargs["identifier"] == record.event_identifier


# ---------------------------------------------------------------------------
# run() orchestration
# ---------------------------------------------------------------------------


class TestRun:
    """Tests for the run() orchestration. Mocks all external calls."""

    def _patch_externals(self, watermark=None, records=None, sub_map=None):
        """Return a context manager that patches all external dependencies."""
        from contextlib import ExitStack

        stack = ExitStack()
        mocks = {}
        mocks["get_watermark"] = stack.enter_context(patch("app.usage_report.get_watermark", return_value=watermark))
        mocks["set_watermark"] = stack.enter_context(patch("app.usage_report.set_watermark"))
        mocks["query_usage"] = stack.enter_context(patch("app.usage_report.query_usage", return_value=records or []))
        mocks["load_subscription_map"] = stack.enter_context(
            patch("app.usage_report.load_subscription_map", return_value=sub_map or {})
        )
        mocks["push_meter_events"] = stack.enter_context(
            patch("app.usage_report.push_meter_events", return_value=(len(records or []), 0))
        )
        mocks["stripe"] = stack.enter_context(patch("app.usage_report.stripe"))
        return stack, mocks

    def test_no_records_advances_watermark(self):
        cfg = make_config()
        stack, mocks = self._patch_externals(records=[])
        with stack:
            result = run(cfg)
        assert result.status == "ok"
        assert result.records_found == 0
        mocks["set_watermark"].assert_called_once()

    def test_noop_when_start_after_end(self):
        cfg = make_config()
        # Watermark is in the future relative to now-delay
        future_wm = datetime.now(UTC) + timedelta(hours=1)
        stack, mocks = self._patch_externals(watermark=future_wm)
        with stack:
            result = run(cfg)
        assert result.status == "noop"
        mocks["query_usage"].assert_not_called()
        mocks["set_watermark"].assert_not_called()

    def test_with_records_pushes_and_advances(self):
        cfg = make_config()
        records = [make_record("sub1", "h1"), make_record("sub2", "h2", size=200_000)]
        stack, mocks = self._patch_externals(records=records, sub_map={"sub1": "cus_1", "sub2": "cus_2"})
        mocks["push_meter_events"].return_value = (2, 0)
        with stack:
            result = run(cfg)
        assert result.status == "ok"
        assert result.records_found == 2
        assert result.pushed == 2
        assert result.skipped == 0
        assert result.total_billable_units == 3  # 1 + 2
        assert result.total_bytes == 300_000
        assert result.unique_subscriptions == 2
        mocks["set_watermark"].assert_called_once()
        mocks["load_subscription_map"].assert_called_once()

    def test_skipped_records_tracked(self):
        cfg = make_config()
        records = [make_record("sub1"), make_record("unmapped")]
        stack, mocks = self._patch_externals(records=records, sub_map={"sub1": "cus_1"})
        mocks["push_meter_events"].return_value = (1, 1)
        with stack:
            result = run(cfg)
        assert result.pushed == 1
        assert result.skipped == 1

    def test_does_not_load_sub_map_when_no_records(self):
        cfg = make_config()
        stack, mocks = self._patch_externals(records=[])
        with stack:
            run(cfg)
        mocks["load_subscription_map"].assert_not_called()

    def test_sets_stripe_api_key(self):
        cfg = make_config(stripe_secret_key="sk_test_xyz")
        stack, mocks = self._patch_externals(records=[])
        with stack:
            run(cfg)
        assert mocks["stripe"].api_key == "sk_test_xyz"

    def test_result_has_duration(self):
        cfg = make_config()
        stack, mocks = self._patch_externals(records=[])
        with stack:
            result = run(cfg)
        assert result.duration_seconds >= 0

    def test_watermark_used_for_window_start(self):
        cfg = make_config()
        wm = datetime.now(UTC) - timedelta(hours=1)  # recent enough to avoid cap
        stack, mocks = self._patch_externals(watermark=wm, records=[])
        with stack:
            run(cfg)
        call_args = mocks["query_usage"].call_args
        assert call_args[0][1] == wm  # start arg

    def test_old_watermark_gets_capped(self):
        cfg = make_config()
        old_wm = datetime.now(UTC) - timedelta(days=5)
        stack, mocks = self._patch_externals(watermark=old_wm, records=[])
        with stack:
            run(cfg)
        # Start should be capped to max_window_hours (24h), not 5 days ago
        call_args = mocks["query_usage"].call_args
        actual_start = call_args[0][1]
        assert (datetime.now(UTC) - actual_start) < timedelta(hours=25)

    def test_query_failure_propagates(self):
        cfg = make_config()
        stack, mocks = self._patch_externals()
        mocks["query_usage"].side_effect = RuntimeError("KQL failed")
        with stack:
            with pytest.raises(RuntimeError, match="KQL failed"):
                run(cfg)
