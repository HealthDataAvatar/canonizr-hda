"""Unit tests for the retry utility."""

import time
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi import HTTPException

from app.services.retry import Attempt, _should_keep_trying, backoff_delay, request_with_retry


def _deadline(seconds: float) -> float:
    return time.monotonic() + seconds


class _MockTransport(httpx.AsyncBaseTransport):
    """Returns canned responses in sequence."""

    def __init__(self, responses: list[httpx.Response]):
        self._responses = list(responses)
        self._calls = 0

    async def handle_async_request(self, request):
        idx = min(self._calls, len(self._responses) - 1)
        self._calls += 1
        return self._responses[idx]

    @property
    def call_count(self):
        return self._calls


def _response(status: int, headers: dict | None = None) -> httpx.Response:
    return httpx.Response(status, headers=headers or {}, content=b"error")


# Patch sleep so retry tests run instantly
_no_sleep = patch("app.services.retry.asyncio.sleep", new_callable=AsyncMock)


@pytest.mark.asyncio
async def test_success_no_retry():
    transport = _MockTransport([_response(200)])
    async with httpx.AsyncClient(transport=transport) as client:
        resp = await request_with_retry(
            client,
            "POST",
            "http://test/api",
            deadline=_deadline(10),
        )
    assert resp.status_code == 200
    assert transport.call_count == 1


@pytest.mark.asyncio
@_no_sleep
async def test_retry_on_429_then_success(_sleep):
    transport = _MockTransport(
        [
            _response(429, {"retry-after": "0.01"}),
            _response(200),
        ]
    )
    async with httpx.AsyncClient(transport=transport) as client:
        resp = await request_with_retry(
            client,
            "POST",
            "http://test/api",
            deadline=_deadline(10),
        )
    assert resp.status_code == 200
    assert transport.call_count == 2


@pytest.mark.asyncio
@_no_sleep
async def test_retry_on_503_then_success(_sleep):
    transport = _MockTransport([_response(503), _response(200)])
    async with httpx.AsyncClient(transport=transport) as client:
        resp = await request_with_retry(
            client,
            "POST",
            "http://test/api",
            deadline=_deadline(10),
        )
    assert resp.status_code == 200
    assert transport.call_count == 2


@pytest.mark.asyncio
@_no_sleep
async def test_exhausted_retries_429_raises_429(_sleep):
    """429s retry until deadline — with mocked sleep, deadline never advances so it retries the safety bound."""
    transport = _MockTransport([_response(429)] * 5)
    async with httpx.AsyncClient(transport=transport) as client:
        with pytest.raises(HTTPException) as exc_info:
            await request_with_retry(
                client,
                "POST",
                "http://test/api",
                deadline=_deadline(10),
            )
    assert exc_info.value.status_code == 429


@pytest.mark.asyncio
@_no_sleep
async def test_exhausted_retries_502_raises_502(_sleep):
    transport = _MockTransport([_response(502)] * 5)
    async with httpx.AsyncClient(transport=transport) as client:
        with pytest.raises(HTTPException) as exc_info:
            await request_with_retry(
                client,
                "POST",
                "http://test/api",
                deadline=_deadline(10),
                max_retries=2,
            )
    assert exc_info.value.status_code == 502


@pytest.mark.asyncio
async def test_deadline_exceeded_stops_retries():
    transport = _MockTransport(
        [
            _response(429, {"retry-after": "100"}),
            _response(200),
        ]
    )
    async with httpx.AsyncClient(transport=transport) as client:
        with pytest.raises(HTTPException) as exc_info:
            await request_with_retry(
                client,
                "POST",
                "http://test/api",
                deadline=_deadline(0.1),
                max_retries=5,
            )
    assert transport.call_count == 1
    assert exc_info.value.status_code == 429


@pytest.mark.asyncio
async def test_no_retry_on_4xx():
    """Non-429 client errors should not be retried."""
    transport = _MockTransport([_response(400)])
    async with httpx.AsyncClient(transport=transport) as client:
        resp = await request_with_retry(
            client,
            "POST",
            "http://test/api",
            deadline=_deadline(10),
        )
    assert resp.status_code == 400
    assert transport.call_count == 1


@pytest.mark.asyncio
async def test_zero_retries_propagates_5xx_immediately():
    """max_retries=0 stops 5xx retries after first attempt."""
    transport = _MockTransport([_response(500)])
    async with httpx.AsyncClient(transport=transport) as client:
        with pytest.raises(HTTPException) as exc_info:
            await request_with_retry(
                client,
                "POST",
                "http://test/api",
                deadline=_deadline(10),
                max_retries=0,
            )
    assert exc_info.value.status_code == 502
    assert transport.call_count == 1


@pytest.mark.asyncio
@_no_sleep
async def test_429_retries_until_deadline(_sleep):
    """429s ignore max_retries and retry until deadline expires."""
    transport = _MockTransport([_response(429)] * 10)
    async with httpx.AsyncClient(transport=transport) as client:
        with pytest.raises(HTTPException) as exc_info:
            await request_with_retry(
                client,
                "POST",
                "http://test/api",
                deadline=_deadline(0.01),
                max_retries=0,
            )
    assert exc_info.value.status_code == 429
    assert transport.call_count >= 1


# ---------------------------------------------------------------------------
# Attempt dataclass
# ---------------------------------------------------------------------------


def _fake_response(status: int = 200) -> httpx.Response:
    return httpx.Response(status, content=b"")


def _make_attempt(
    status_code: int = 200, attempt_number: int = 0, response: httpx.Response | None = None, **kwargs
) -> Attempt:
    if response is None:
        response = _fake_response(status_code)
    defaults = dict(error=None, duration_ms=10.0, response_bytes=0)
    defaults.update(kwargs)
    return Attempt(response=response, status_code=status_code, attempt_number=attempt_number, **defaults)


class TestAttempt:
    def test_succeeded_on_200(self):
        assert _make_attempt(200).succeeded is True

    def test_succeeded_on_400(self):
        assert _make_attempt(400).succeeded is True

    def test_not_succeeded_on_429(self):
        assert _make_attempt(429).succeeded is False

    def test_not_succeeded_on_500(self):
        assert _make_attempt(500).succeeded is False

    def test_not_succeeded_when_no_response(self):
        att = Attempt(
            response=None, error="timeout", status_code=504, duration_ms=10.0, response_bytes=0, attempt_number=0
        )
        assert att.succeeded is False

    def test_should_retry_on_rate_limit(self):
        assert _make_attempt(429).should_retry_on_rate_limit is True
        assert _make_attempt(500).should_retry_on_rate_limit is False


# ---------------------------------------------------------------------------
# _should_keep_trying (pure function)
# ---------------------------------------------------------------------------


class TestShouldKeepTrying:
    def test_stops_on_success(self):
        att = _make_attempt(200)
        assert _should_keep_trying(att, max_retries=2, deadline=_deadline(10)) is None

    def test_retries_429_within_deadline(self):
        att = _make_attempt(429)
        delay = _should_keep_trying(att, max_retries=0, deadline=_deadline(10))
        assert delay is not None
        assert delay > 0

    def test_stops_5xx_after_max_retries(self):
        att = _make_attempt(502, attempt_number=2)
        assert _should_keep_trying(att, max_retries=2, deadline=_deadline(10)) is None

    def test_retries_5xx_before_max_retries(self):
        att = _make_attempt(502, attempt_number=0)
        delay = _should_keep_trying(att, max_retries=2, deadline=_deadline(10))
        assert delay is not None

    def test_stops_when_delay_exceeds_deadline(self):
        att = _make_attempt(502, attempt_number=0)
        assert _should_keep_trying(att, max_retries=2, deadline=_deadline(0.001)) is None


# ---------------------------------------------------------------------------
# backoff_delay (pure function, no patching needed)
# ---------------------------------------------------------------------------


def test_backoff_delay_respects_retry_after():
    assert backoff_delay(0, "5.0") == 5.0


def test_backoff_delay_caps_retry_after():
    assert backoff_delay(0, "999") == 60.0


def test_backoff_delay_exponential_fallback():
    delay = backoff_delay(0, None)
    assert 1.0 <= delay <= 2.0
    delay = backoff_delay(2, None)
    assert 4.0 <= delay <= 5.0
