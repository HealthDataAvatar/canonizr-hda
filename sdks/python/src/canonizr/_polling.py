"""Polling and backoff logic.

Respects Retry-After headers. Falls back to exponential backoff with jitter.
Separate strategies for 202 (processing) and 429 (rate limited).
"""

from __future__ import annotations

import random
import time

# 202 backoff: 2s start, 15s cap
POLL_INITIAL = 2.0
POLL_CAP = 15.0
POLL_MULTIPLIER = 1.5

# 429 backoff: 5s start, 60s cap, with jitter
RATE_LIMIT_INITIAL = 5.0
RATE_LIMIT_CAP = 60.0
RATE_LIMIT_MULTIPLIER = 2.0

DEFAULT_TIMEOUT = 300.0


def poll_delay(retry_after: float | None, attempt: int) -> float:
    """Compute delay for a 202 response."""
    if retry_after is not None and retry_after >= 0:
        return retry_after
    return min(POLL_INITIAL * (POLL_MULTIPLIER ** attempt), POLL_CAP)


def rate_limit_delay(retry_after: float | None, attempt: int) -> float:
    """Compute delay for a 429 response (with jitter)."""
    if retry_after is not None and retry_after >= 0:
        return retry_after
    base = min(RATE_LIMIT_INITIAL * (RATE_LIMIT_MULTIPLIER ** attempt), RATE_LIMIT_CAP)
    return base + random.uniform(0, base * 0.25)


def parse_retry_after(header: str | None) -> float | None:
    """Parse a Retry-After header value (seconds only, not HTTP-date)."""
    if not header:
        return None
    try:
        return float(header)
    except ValueError:
        return None


class DeadlineTracker:
    """Tracks wall-clock time against a deadline."""

    def __init__(self, timeout: float):
        self.timeout = timeout
        self._start = time.monotonic()

    @property
    def remaining(self) -> float:
        return max(0.0, self.timeout - (time.monotonic() - self._start))

    @property
    def expired(self) -> bool:
        return self.remaining <= 0

    def clamp(self, delay: float) -> float:
        """Clamp delay to remaining time."""
        return min(delay, self.remaining)
