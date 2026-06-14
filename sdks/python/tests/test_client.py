"""Tests for the Canonizr sync client against a fake transport."""

from __future__ import annotations

import pytest

from canonizr import (
    AuthError,
    Canonizr,
    CanonizrError,
    FileTooLargeError,
    JobExpiredError,
    JobFailedError,
    RateLimitError,
    UnsupportedFileError,
)
from canonizr._transport import Response
from canonizr.errors import TimeoutError

from .fakes import FakeTransport, json_response, json_response_with_headers

SUBMIT_OK = json_response(202, {
    "job_id": "abc123",
    "poll_url": "/v1/canonize/abc123",
    "estimated_seconds": 5,
    "input_bytes": 1000,
    "billable_units": 1,
    "retention_seconds": 86400,
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
        {"name": "page-0", "mime_type": "image/png", "size_bytes": 20000, "label": "Page 1"},
    ],
    "expires_at": "2026-06-13T00:00:00Z",
})

ARTEFACT_BODY = b"# Hello World\n\nThis is the extracted markdown."


def _make_client(transport: FakeTransport) -> Canonizr:
    return Canonizr(transport=transport, timeout=5.0, cache=False)


class TestCanonize:
    def test_submit_and_poll_to_completion(self, tmp_path):
        t = FakeTransport()
        t.enqueue(SUBMIT_OK, POLL_OK)
        client = _make_client(t)

        f = tmp_path / "doc.pdf"
        f.write_bytes(b"pdf content")

        result = client.canonize(f)

        assert result.job_id == "abc123"
        assert result.has("markdown")
        assert result.has("page-0")
        assert result.artefact_names() == ["markdown", "page-0"]
        assert result.metadata is not None
        assert result.metadata["detected_type"] == "application/pdf"

    def test_sends_filename_and_bytes(self, tmp_path):
        t = FakeTransport()
        t.enqueue(SUBMIT_OK, POLL_OK)
        client = _make_client(t)

        f = tmp_path / "report.pdf"
        f.write_bytes(b"pdf bytes")
        client.canonize(f)

        files = t.requests[0].files
        assert files is not None
        name, data, mime = files["file"]
        assert name == "report.pdf"
        assert data == b"pdf bytes"

    def test_waits_through_processing(self, tmp_path):
        t = FakeTransport()
        t.enqueue(SUBMIT_OK, POLL_PROCESSING, POLL_PROCESSING, POLL_OK)
        client = _make_client(t)

        f = tmp_path / "doc.pdf"
        f.write_bytes(b"content")

        result = client.canonize(f)

        assert result.status.status == "ok"
        # 1 POST + 3 GETs
        assert len(t.requests) == 4

    def test_lazy_artefact_fetch(self, tmp_path):
        t = FakeTransport()
        artefact_resp = Response(status_code=200, body=ARTEFACT_BODY, headers={})
        t.enqueue(SUBMIT_OK, POLL_OK, artefact_resp)
        client = _make_client(t)

        f = tmp_path / "doc.pdf"
        f.write_bytes(b"pdf content")

        result = client.canonize(f)
        content = result.get("markdown")

        assert content == ARTEFACT_BODY
        assert len(t.requests) == 3
        assert t.requests[2].path == "/v1/canonize/abc123/artefacts/markdown"

    def test_error_status_raises(self, tmp_path):
        t = FakeTransport()
        t.enqueue(
            SUBMIT_OK,
            json_response(200, {"job_id": "abc123", "status": "error", "detail": "OCR failed"}),
        )
        client = _make_client(t)

        f = tmp_path / "doc.pdf"
        f.write_bytes(b"content")

        with pytest.raises(JobFailedError, match="OCR failed"):
            client.canonize(f)

    def test_expired_status_raises(self, tmp_path):
        t = FakeTransport()
        t.enqueue(
            SUBMIT_OK,
            json_response(200, {"job_id": "abc123", "status": "expired", "detail": "Gone"}),
        )
        client = _make_client(t)

        f = tmp_path / "doc.pdf"
        f.write_bytes(b"content")

        with pytest.raises(JobExpiredError, match="Gone"):
            client.canonize(f)

    def test_timeout_raises(self, tmp_path):
        t = FakeTransport()
        t.enqueue(
            SUBMIT_OK,
            json_response_with_headers(
                202,
                {"job_id": "abc123", "status": "processing"},
                {"retry-after": "100"},
            ),
        )
        client = _make_client(t)

        f = tmp_path / "doc.pdf"
        f.write_bytes(b"content")

        with pytest.raises(TimeoutError) as exc_info:
            client.canonize(f, timeout=0.01)
        assert exc_info.value.job_id == "abc123"


class TestSubmitErrors:
    def test_401_raises_auth_error(self, tmp_path):
        t = FakeTransport()
        t.enqueue(json_response(401, {"detail": "Invalid API key"}))
        client = _make_client(t)

        f = tmp_path / "doc.pdf"
        f.write_bytes(b"content")

        with pytest.raises(AuthError):
            client.canonize(f)

    def test_413_raises_file_too_large(self, tmp_path):
        t = FakeTransport()
        t.enqueue(json_response(413, {"detail": "File too large"}))
        client = _make_client(t)

        f = tmp_path / "big.pdf"
        f.write_bytes(b"x" * 100)

        with pytest.raises(FileTooLargeError):
            client.canonize(f)

    def test_400_raises_unsupported_file(self, tmp_path):
        t = FakeTransport()
        t.enqueue(json_response(400, {"detail": "Unsupported file type: application/zip"}))
        client = _make_client(t)

        f = tmp_path / "archive.zip"
        f.write_bytes(b"pk content")

        with pytest.raises(UnsupportedFileError):
            client.canonize(f)

    def test_429_raises_rate_limit(self, tmp_path):
        t = FakeTransport()
        t.enqueue(json_response(429, {"detail": "Quota exceeded"}))
        client = _make_client(t)

        f = tmp_path / "doc.pdf"
        f.write_bytes(b"content")

        with pytest.raises(RateLimitError):
            client.canonize(f)


class TestGetStatus:
    def test_returns_status(self):
        t = FakeTransport()
        t.enqueue(POLL_OK)
        client = _make_client(t)

        status = client.get_status("abc123")

        assert status.status == "ok"
        assert status.done
        assert len(status.artefacts) == 2

    def test_processing(self):
        t = FakeTransport()
        t.enqueue(POLL_PROCESSING)
        client = _make_client(t)

        status = client.get_status("abc123")

        assert status.status == "processing"
        assert not status.done

    def test_410_raises_expired(self):
        t = FakeTransport()
        t.enqueue(json_response(410, {"detail": "Result expired"}))
        client = _make_client(t)

        with pytest.raises(JobExpiredError):
            client.get_status("abc123")

    def test_500_raises_job_failed(self):
        t = FakeTransport()
        t.enqueue(json_response(500, {"detail": "Processing failed"}))
        client = _make_client(t)

        with pytest.raises(JobFailedError):
            client.get_status("abc123")


class TestGetArtefact:
    def test_returns_bytes(self):
        t = FakeTransport()
        t.enqueue(Response(status_code=200, body=b"png bytes here", headers={}))
        client = _make_client(t)

        data = client.get_artefact("abc123", "page-0")

        assert data == b"png bytes here"
        assert t.requests[0].path == "/v1/canonize/abc123/artefacts/page-0"


class TestDelete:
    def test_success(self):
        t = FakeTransport()
        t.enqueue(Response(status_code=204, body=b"", headers={}))
        client = _make_client(t)

        client.delete("abc123")

        assert t.requests[0].method == "DELETE"
        assert t.requests[0].path == "/v1/canonize/abc123"

    def test_404_raises(self):
        t = FakeTransport()
        t.enqueue(json_response(404, {"detail": "Job not found"}))
        client = _make_client(t)

        with pytest.raises(CanonizrError):
            client.delete("unknown")


class TestContextManager:
    def test_closes_transport_on_exit(self):
        t = FakeTransport()
        with Canonizr(transport=t, cache=False):
            pass
        assert t.closed
