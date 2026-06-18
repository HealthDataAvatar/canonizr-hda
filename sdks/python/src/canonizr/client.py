"""Canonizr client — sync and async variants.

All HTTP goes through the Transport protocol, making the client
logic testable with a fake transport (no httpx mocking needed).

Sync client: canonize(), get_status(), get_artefact(), delete().
Async client: adds submit() and poll() for granular control.

Both clients check the disk cache before submitting, and cache
results + artefacts after fetching. Pass cache=False to disable.
"""

from __future__ import annotations

import asyncio
import mimetypes
import time
from pathlib import Path
from typing import BinaryIO

from ._polling import DEFAULT_TIMEOUT, DeadlineTracker, parse_retry_after, poll_delay, rate_limit_delay
from ._transport import AsyncHttpxTransport, AsyncTransport, HttpxTransport, Response, Transport
from .cache import DiskCache
from .errors import JobExpiredError, JobFailedError, TimeoutError, raise_for_status
from .models import AsyncCanonizeResult, CanonizeResult, JobStatus, SubmitResult

DEFAULT_BASE_URL = "https://api.canonizr.com"


def _require_https(base_url: str) -> None:
    """Refuse to send the API key over plaintext HTTP.

    Localhost is allowed for development against a local gateway.
    """
    if base_url.startswith("https://"):
        return
    if base_url.startswith(("http://localhost", "http://127.0.0.1")):
        return
    raise ValueError(f"base_url must use https:// (got {base_url!r}); the API key is sent in the Authorization header")


def _guess_mime(filename: str) -> str:
    mime, _ = mimetypes.guess_type(filename)
    return mime or "application/octet-stream"


def _read_file(file: str | Path | BinaryIO) -> tuple[str, bytes]:
    """Read file content and return (filename, bytes)."""
    if isinstance(file, (str, Path)):
        p = Path(file)
        return p.name, p.read_bytes()
    name = getattr(file, "name", "document")
    if isinstance(name, (str, Path)):
        name = Path(name).name
    else:
        name = "document"
    return name, file.read()


def _raise_error(resp: Response) -> None:
    """Map an error response to a CanonizrError.

    Tolerates non-JSON bodies (e.g. an HTML 502 from a proxy) and carries
    the parsed Retry-After through to RateLimitError.
    """
    try:
        detail = resp.json().get("detail", resp.body.decode(errors="replace"))
    except (ValueError, UnicodeDecodeError):
        detail = resp.body.decode(errors="replace") or f"HTTP {resp.status_code}"
    retry_after = parse_retry_after(resp.headers.get("retry-after"))
    raise_for_status(resp.status_code, detail, retry_after)


def _check_submit(resp: Response) -> SubmitResult:
    if resp.status_code == 202:
        return SubmitResult.from_response(resp.json())
    _raise_error(resp)
    raise AssertionError("unreachable")


def _check_poll(resp: Response) -> JobStatus:
    if resp.status_code in (200, 202):
        return JobStatus.from_response(resp.json())
    _raise_error(resp)
    raise AssertionError("unreachable")


def _check_terminal(status: JobStatus) -> None:
    """Raise if the job ended in error or expiry."""
    if status.status == "error":
        raise JobFailedError(status.detail or "Job processing failed")
    if status.status == "expired":
        raise JobExpiredError(status.detail or "Job expired")


# ---------------------------------------------------------------------------
# Shared polling logic (sync)
# ---------------------------------------------------------------------------


def _poll_sync(transport: Transport, job_id: str, timeout: float) -> JobStatus:
    deadline = DeadlineTracker(timeout)
    attempt = 0
    rate_attempt = 0

    while not deadline.expired:
        resp = transport.get(f"/v1/canonize/{job_id}")

        if resp.status_code == 429:
            retry_after = parse_retry_after(resp.headers.get("retry-after"))
            delay = deadline.clamp(rate_limit_delay(retry_after, rate_attempt))
            rate_attempt += 1
            if delay > 0:
                time.sleep(delay)
            continue

        status = _check_poll(resp)
        if status.done:
            return status

        retry_after = parse_retry_after(resp.headers.get("retry-after"))
        delay = deadline.clamp(poll_delay(retry_after, attempt))
        attempt += 1
        if delay > 0:
            time.sleep(delay)

    raise TimeoutError(job_id, timeout)


# ---------------------------------------------------------------------------
# Shared polling logic (async)
# ---------------------------------------------------------------------------


async def _poll_async(transport: AsyncTransport, job_id: str, timeout: float) -> JobStatus:
    deadline = DeadlineTracker(timeout)
    attempt = 0
    rate_attempt = 0

    while not deadline.expired:
        resp = await transport.get(f"/v1/canonize/{job_id}")

        if resp.status_code == 429:
            retry_after = parse_retry_after(resp.headers.get("retry-after"))
            delay = deadline.clamp(rate_limit_delay(retry_after, rate_attempt))
            rate_attempt += 1
            if delay > 0:
                await asyncio.sleep(delay)
            continue

        status = _check_poll(resp)
        if status.done:
            return status

        retry_after = parse_retry_after(resp.headers.get("retry-after"))
        delay = deadline.clamp(poll_delay(retry_after, attempt))
        attempt += 1
        if delay > 0:
            await asyncio.sleep(delay)

    raise TimeoutError(job_id, timeout)


# ---------------------------------------------------------------------------
# Sync client
# ---------------------------------------------------------------------------


class Canonizr:
    """Sync client for the Canonizr API.

    Args:
        api_key: Your Canonizr API key.
        base_url: API base URL (default: https://api.canonizr.com).
        timeout: Default polling timeout in seconds (default: 300).
        cache: Pass False to disable disk caching, or a DiskCache instance
               to use a custom cache. Default: enabled with default settings.
        transport: Custom Transport implementation (for testing). If provided,
                   api_key and base_url are ignored.
    """

    def __init__(
        self,
        api_key: str = "",
        *,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = DEFAULT_TIMEOUT,
        cache: DiskCache | bool = True,
        transport: Transport | None = None,
    ):
        if transport is None:
            _require_https(base_url)
        self._transport = transport or HttpxTransport(base_url, api_key)
        self._timeout = timeout
        if cache is True:
            self._cache: DiskCache | None = DiskCache()
        elif cache is False:
            self._cache = None
        else:
            self._cache = cache

    def canonize(self, file: str | Path | BinaryIO, *, timeout: float | None = None) -> CanonizeResult:
        """Submit a file, wait for processing, return the result.

        Checks the cache first. On a miss, submits to the API, polls
        until done, and caches the result. Artefact content is fetched
        lazily via result.get(name) and cached on first access.
        """
        filename, data = _read_file(file)
        file_hash = self._cache.file_hash(data) if self._cache else None

        # Cache hit?
        if self._cache and file_hash:
            cached = self._cache.get_status(file_hash)
            if cached and cached.status == "ok":

                def fetch_cached(name: str) -> bytes:
                    assert self._cache is not None and file_hash is not None
                    hit = self._cache.get_artefact(file_hash, name)
                    if hit is not None:
                        return hit
                    content = self.get_artefact(cached.job_id, name)
                    self._cache.put_artefact(file_hash, name, content)
                    return content

                return CanonizeResult(job_id=cached.job_id, status=cached, _fetch=fetch_cached)

        # Cache miss — submit and poll
        mime = _guess_mime(filename)
        resp = self._transport.post("/v1/canonize", files={"file": (filename, data, mime)})
        info = _check_submit(resp)

        status = _poll_sync(self._transport, info.job_id, timeout or self._timeout)
        _check_terminal(status)

        # Cache the manifest
        if self._cache and file_hash:
            self._cache.put_status(file_hash, status)

        def fetch(name: str) -> bytes:
            content = self.get_artefact(info.job_id, name)
            if self._cache and file_hash:
                self._cache.put_artefact(file_hash, name, content)
            return content

        return CanonizeResult(job_id=info.job_id, status=status, _fetch=fetch)

    def get_status(self, job_id: str) -> JobStatus:
        """Single poll — check a job's current state without waiting."""
        resp = self._transport.get(f"/v1/canonize/{job_id}")
        return _check_poll(resp)

    def get_artefact(self, job_id: str, name: str) -> bytes:
        """Download a single artefact by name."""
        resp = self._transport.get(f"/v1/canonize/{job_id}/artefacts/{name}")
        if resp.status_code == 200:
            return resp.body
        _raise_error(resp)
        raise AssertionError("unreachable")

    def delete(self, job_id: str) -> None:
        """Delete a job's stored files."""
        resp = self._transport.delete(f"/v1/canonize/{job_id}")
        if resp.status_code == 204:
            return
        _raise_error(resp)

    def __enter__(self) -> Canonizr:
        return self

    def __exit__(self, *args: object) -> None:
        self._transport.close()


# ---------------------------------------------------------------------------
# Async client
# ---------------------------------------------------------------------------


class AsyncCanonizr:
    """Async client for the Canonizr API.

    Exposes submit() and poll() separately for granular control
    (batch submissions, concurrent polling, etc).

    Args:
        api_key: Your Canonizr API key.
        base_url: API base URL (default: https://api.canonizr.com).
        timeout: Default polling timeout in seconds (default: 300).
        cache: Pass False to disable disk caching, or a DiskCache instance
               to use a custom cache. Default: enabled with default settings.
        transport: Custom AsyncTransport implementation (for testing).
    """

    def __init__(
        self,
        api_key: str = "",
        *,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = DEFAULT_TIMEOUT,
        cache: DiskCache | bool = True,
        transport: AsyncTransport | None = None,
    ):
        if transport is None:
            _require_https(base_url)
        self._transport = transport or AsyncHttpxTransport(base_url, api_key)
        self._timeout = timeout
        if cache is True:
            self._cache: DiskCache | None = DiskCache()
        elif cache is False:
            self._cache = None
        else:
            self._cache = cache

    async def submit(self, file: str | Path | BinaryIO) -> SubmitResult:
        """Submit a file for conversion. Returns immediately with job info."""
        filename, data = _read_file(file)
        mime = _guess_mime(filename)
        resp = await self._transport.post("/v1/canonize", files={"file": (filename, data, mime)})
        return _check_submit(resp)

    async def poll(self, job_id: str, *, timeout: float | None = None) -> JobStatus:
        """Poll until the job completes or times out."""
        return await _poll_async(self._transport, job_id, timeout or self._timeout)

    async def canonize(self, file: str | Path | BinaryIO, *, timeout: float | None = None) -> AsyncCanonizeResult:
        """Submit a file, wait for processing, return the result.

        Checks the cache first. On a miss, submits to the API, polls
        until done, and caches the result.
        """
        filename, data = _read_file(file)
        file_hash = self._cache.file_hash(data) if self._cache else None

        # Cache hit?
        if self._cache and file_hash:
            cached = self._cache.get_status(file_hash)
            if cached and cached.status == "ok":

                async def fetch_cached(name: str) -> bytes:
                    assert self._cache is not None and file_hash is not None
                    hit = self._cache.get_artefact(file_hash, name)
                    if hit is not None:
                        return hit
                    content = await self.get_artefact(cached.job_id, name)
                    self._cache.put_artefact(file_hash, name, content)
                    return content

                return AsyncCanonizeResult(job_id=cached.job_id, status=cached, _fetch=fetch_cached)

        # Cache miss — submit and poll
        mime = _guess_mime(filename)
        resp = await self._transport.post("/v1/canonize", files={"file": (filename, data, mime)})
        info = _check_submit(resp)

        status = await self.poll(info.job_id, timeout=timeout)
        _check_terminal(status)

        # Cache the manifest
        if self._cache and file_hash:
            self._cache.put_status(file_hash, status)

        async def fetch(name: str) -> bytes:
            content = await self.get_artefact(info.job_id, name)
            if self._cache and file_hash:
                self._cache.put_artefact(file_hash, name, content)
            return content

        return AsyncCanonizeResult(job_id=info.job_id, status=status, _fetch=fetch)

    async def get_status(self, job_id: str) -> JobStatus:
        """Single poll — check a job's current state without waiting."""
        resp = await self._transport.get(f"/v1/canonize/{job_id}")
        return _check_poll(resp)

    async def get_artefact(self, job_id: str, name: str) -> bytes:
        """Download a single artefact by name."""
        resp = await self._transport.get(f"/v1/canonize/{job_id}/artefacts/{name}")
        if resp.status_code == 200:
            return resp.body
        _raise_error(resp)
        raise AssertionError("unreachable")

    async def delete(self, job_id: str) -> None:
        """Delete a job's stored files."""
        resp = await self._transport.delete(f"/v1/canonize/{job_id}")
        if resp.status_code == 204:
            return
        _raise_error(resp)

    async def __aenter__(self) -> AsyncCanonizr:
        return self

    async def __aexit__(self, *args: object) -> None:
        await self._transport.close()
