"""Tests for polling/backoff logic."""

from __future__ import annotations

from canonizr._polling import DeadlineTracker, parse_retry_after, poll_delay, rate_limit_delay


class TestPollDelay:
    def test_respects_retry_after(self):
        assert poll_delay(retry_after=10.0, attempt=0) == 10.0

    def test_exponential_backoff_without_retry_after(self):
        d0 = poll_delay(retry_after=None, attempt=0)
        d1 = poll_delay(retry_after=None, attempt=1)
        d5 = poll_delay(retry_after=None, attempt=5)

        assert d0 == 2.0
        assert d1 > d0
        assert d5 <= 15.0  # capped

    def test_caps_at_maximum(self):
        d = poll_delay(retry_after=None, attempt=100)
        assert d == 15.0


class TestRateLimitDelay:
    def test_respects_retry_after(self):
        assert rate_limit_delay(retry_after=30.0, attempt=0) == 30.0

    def test_includes_jitter(self):
        delays = {rate_limit_delay(retry_after=None, attempt=0) for _ in range(20)}
        assert len(delays) > 1  # jitter should produce different values

    def test_caps_at_maximum(self):
        d = rate_limit_delay(retry_after=None, attempt=100)
        assert d <= 60.0 * 1.25  # cap + max jitter


class TestParseRetryAfter:
    def test_valid_integer(self):
        assert parse_retry_after("5") == 5.0

    def test_valid_float(self):
        assert parse_retry_after("2.5") == 2.5

    def test_none(self):
        assert parse_retry_after(None) is None

    def test_empty(self):
        assert parse_retry_after("") is None

    def test_invalid(self):
        assert parse_retry_after("not-a-number") is None


class TestDeadlineTracker:
    def test_not_expired_initially(self):
        dt = DeadlineTracker(timeout=10.0)
        assert not dt.expired
        assert dt.remaining > 0

    def test_clamp_within_remaining(self):
        dt = DeadlineTracker(timeout=100.0)
        assert dt.clamp(5.0) == 5.0

    def test_clamp_to_remaining(self):
        dt = DeadlineTracker(timeout=0.001)
        import time
        time.sleep(0.01)
        assert dt.clamp(10.0) == 0.0  # expired
