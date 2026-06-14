"""Tests for the async Canonizr client against a fake transport."""

from __future__ import annotations

import pytest

from canonizr import AsyncCanonizr, AuthError, JobFailedError
from canonizr._transport import Response

from .fakes import FakeAsyncTransport, json_response, json_response_with_headers

SUBMIT_OK = json_response(202, {
    "job_id": "abc123",
    "poll_url": "/v1/canonize/abc123",
    "estimated_seconds": 5,
    "input_bytes": 1000,
    "billable_units": 1,
})

POLL_PROCESSING = json_response_with_headers(
    202,
    {"job_id": "abc123", "status": "processing"},
    {"retry-after": "0"},
)

POLL_OK = json_response(200, {
    "job_id": "abc123",
    "status": "ok",
    "metadata": {"detected_type": "application/pdf", "input_bytes": 1000, "input_hash": "deadbeef"},
    "artefacts": [
        {"name": "markdown", "mime_type": "text/markdown", "size_bytes": 500, "label": "Extracted text"},
    ],
})


def _make_client(transport: FakeAsyncTransport) -> AsyncCanonizr:
    return AsyncCanonizr(transport=transport, timeout=5.0, cache=False)


class TestAsyncSubmit:
    async def test_returns_job_info(self, tmp_path):
        t = FakeAsyncTransport()
        t.enqueue(SUBMIT_OK)
        client = _make_client(t)

        f = tmp_path / "doc.pdf"
        f.write_bytes(b"content")
        result = await client.submit(f)

        assert result.job_id == "abc123"
        assert result.input_bytes == 1000

    async def test_401_raises(self, tmp_path):
        t = FakeAsyncTransport()
        t.enqueue(json_response(401, {"detail": "Bad key"}))
        client = _make_client(t)

        f = tmp_path / "doc.pdf"
        f.write_bytes(b"content")

        with pytest.raises(AuthError):
            await client.submit(f)


class TestAsyncPoll:
    async def test_waits_through_processing(self):
        t = FakeAsyncTransport()
        t.enqueue(POLL_PROCESSING, POLL_PROCESSING, POLL_OK)
        client = _make_client(t)

        status = await client.poll("abc123")

        assert status.status == "ok"
        assert len(t.requests) == 3


class TestAsyncCanonize:
    async def test_full_flow(self, tmp_path):
        t = FakeAsyncTransport()
        t.enqueue(SUBMIT_OK, POLL_PROCESSING, POLL_OK)
        client = _make_client(t)

        f = tmp_path / "doc.pdf"
        f.write_bytes(b"pdf content")

        result = await client.canonize(f)
        assert result.job_id == "abc123"
        assert result.has("markdown")

    async def test_lazy_fetch(self, tmp_path):
        t = FakeAsyncTransport()
        t.enqueue(
            SUBMIT_OK,
            POLL_OK,
            Response(status_code=200, body=b"# Markdown output", headers={}),
        )
        client = _make_client(t)

        f = tmp_path / "doc.pdf"
        f.write_bytes(b"content")

        result = await client.canonize(f)
        data = await result.get("markdown")
        assert data == b"# Markdown output"

    async def test_error_raises(self, tmp_path):
        t = FakeAsyncTransport()
        t.enqueue(
            SUBMIT_OK,
            json_response(200, {"job_id": "abc123", "status": "error", "detail": "Boom"}),
        )
        client = _make_client(t)

        f = tmp_path / "doc.pdf"
        f.write_bytes(b"content")

        with pytest.raises(JobFailedError, match="Boom"):
            await client.canonize(f)


class TestAsyncContextManager:
    async def test_closes_transport_on_exit(self):
        t = FakeAsyncTransport()
        async with AsyncCanonizr(transport=t, cache=False):
            pass
        assert t.closed
