"""HTTP request with retry on transient failures.

429s retry until deadline. 5xx respects max_retries.
Telemetry emitted after every attempt. Tracing via optional span.
"""

import asyncio
import logging
import os
import random
import time
from dataclasses import dataclass

import httpx
from fastapi import HTTPException

from ..telemetry import UpstreamRequest, get_telemetry_context
from ..tracing import RetryRecord, Span

logger = logging.getLogger(__name__)

MAX_RETRIES = int(os.environ.get("UPSTREAM_MAX_RETRIES", "2"))
DEFAULT_DEADLINE_S = 300.0  # 5 minutes
_BACKOFF_BASE = 1.0
_BACKOFF_MAX = 60.0
_RETRY_STATUSES = {429, 500, 502, 503, 504}


@dataclass
class Attempt:
    response: httpx.Response | None
    error: str | None
    status_code: int
    duration_ms: float
    response_bytes: int
    attempt_number: int

    @property
    def succeeded(self) -> bool:
        return self.response is not None and self.status_code not in _RETRY_STATUSES

    @property
    def should_retry_on_rate_limit(self) -> bool:
        return self.status_code == 429

    @property
    def retry_after(self) -> str | None:
        if self.response is None:
            return None
        return self.response.headers.get("retry-after")


def _remaining(deadline: float) -> float:
    return max(deadline - time.monotonic(), 0.0)


def backoff_delay(attempt: int, retry_after: str | None) -> float:
    """Compute delay: prefer Retry-After header, fall back to exponential backoff + jitter."""
    if retry_after is not None:
        try:
            delay = float(retry_after)
            return min(max(delay, 0.0), _BACKOFF_MAX)
        except (ValueError, OverflowError):
            pass
    delay = _BACKOFF_BASE * (2**attempt) + random.uniform(0, 1)
    return min(delay, _BACKOFF_MAX)


def _should_keep_trying(att: Attempt, max_retries: int, deadline: float) -> float | None:
    """Return delay before next attempt, or None to stop."""
    if att.succeeded:
        return None

    # 5xx: respect max_retries
    if not att.should_retry_on_rate_limit and att.attempt_number >= max_retries:
        return None

    delay = backoff_delay(att.attempt_number, att.retry_after)
    if delay > _remaining(deadline):
        return None

    return delay


def _observe(att: Attempt, service_name: str, method: str, span: Span, retrying: bool) -> None:
    """Emit telemetry and update span after an attempt."""
    # Telemetry
    emitter, job_id, user_id, mime_type = get_telemetry_context()
    if emitter is not None:
        emitter.emit(
            UpstreamRequest(
                service=service_name,
                method=method,
                status_code=att.status_code,
                duration_ms=round(att.duration_ms, 1),
                response_bytes=att.response_bytes,
                attempt=att.attempt_number,
                retry_after_header=att.retry_after if retrying else None,
                error=att.error,
                job_id=job_id,
                user_id=user_id,
                mime_type=mime_type,
            )
        )

    # Span: record response on first success/final attempt
    if att.response is not None:
        span.set(status_code=att.status_code, response_bytes=att.response_bytes)

    if att.error:
        span.set(error=att.error, retry_attempt=att.attempt_number)

    # Span: record retry details
    if retrying:
        span.add_retry(
            RetryRecord(
                attempt=att.attempt_number,
                status_code=att.status_code,
                delay_s=round(backoff_delay(att.attempt_number, att.retry_after), 2),
                retry_after_header=att.retry_after,
            )
        )


async def _try_once(
    client: httpx.AsyncClient, method: str, url: str, attempt_number: int, deadline: float, **kwargs
) -> Attempt:
    """Make a single HTTP request. Returns an Attempt regardless of outcome."""
    remaining = _remaining(deadline)
    client.timeout = httpx.Timeout(remaining)
    start = time.monotonic()

    try:
        response = await client.request(method, url, **kwargs)
    except httpx.TimeoutException:
        return Attempt(
            response=None,
            error="timeout",
            status_code=504,
            duration_ms=(time.monotonic() - start) * 1000,
            response_bytes=0,
            attempt_number=attempt_number,
        )
    except httpx.RequestError as e:
        return Attempt(
            response=None,
            error=str(e),
            status_code=502,
            duration_ms=(time.monotonic() - start) * 1000,
            response_bytes=0,
            attempt_number=attempt_number,
        )

    return Attempt(
        response=response,
        error=None,
        status_code=response.status_code,
        duration_ms=(time.monotonic() - start) * 1000,
        response_bytes=len(response.content),
        attempt_number=attempt_number,
    )


async def request_with_retry(
    client: httpx.AsyncClient,
    method: str,
    url: str,
    *,
    deadline: float | None = None,
    service_name: str = "upstream",
    max_retries: int = MAX_RETRIES,
    span: Span,
    **kwargs,
) -> httpx.Response:
    """Make an HTTP request with retry on 429/5xx, bounded by a wall-clock deadline."""
    if deadline is None:
        deadline = time.monotonic() + DEFAULT_DEADLINE_S

    last: Attempt | None = None
    attempt_number = 0

    while _remaining(deadline) > 0:
        att = await _try_once(client, method, url, attempt_number, deadline, **kwargs)
        last = att

        # Fatal errors (timeout, connection) — no retry
        if att.error:
            _observe(att, service_name, method, span, retrying=False)
            raise HTTPException(
                status_code=att.status_code,
                detail=f"{service_name} {'service timeout' if att.error == 'timeout' else f'request failed: {att.error}'}",
            )

        # Success or non-retryable status
        if att.succeeded:
            _observe(att, service_name, method, span, retrying=False)
            assert att.response is not None
            return att.response

        # Check if we should retry
        delay = _should_keep_trying(att, max_retries, deadline)
        if delay is None:
            break

        # Retrying — observe then wait
        _observe(att, service_name, method, span, retrying=True)
        await asyncio.sleep(delay)
        attempt_number += 1

    # Exhausted — emit final telemetry and raise
    if last is not None:
        _observe(last, service_name, method, span, retrying=False)
        if last.status_code == 429:
            raise HTTPException(status_code=429, detail=f"{service_name} rate limit exceeded")
        raise HTTPException(
            status_code=502,
            detail=f"{service_name} service error {last.status_code}: {last.response.text if last.response else ''}",
        )

    raise HTTPException(status_code=504, detail=f"{service_name} request deadline exceeded")
