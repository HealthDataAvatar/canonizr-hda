"""Unit tests for the /convert endpoint: headers, error sanitisation, echo headers, queue mode."""
import json
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.crypto import encrypt
from app.queue import JobResult
from app.response import ConvertResult


def _mock_result():
    return ConvertResult(
        markdown="# Hello",
        detected_type="application/pdf",
        actions=["docling", "captioning"],
        input_bytes=2048,
        input_hash="abc123def456",
        images_captioned=3,
        images_skipped=1,
        images_errored=0,
    )


@pytest.fixture
def client():
    from app.app import app
    return TestClient(app)


class TestAuditHeaders:
    def test_json_response_has_audit_headers(self, client):
        with patch("app.app.convert", new_callable=AsyncMock, return_value=_mock_result()):
            resp = client.post("/convert", files={"file": ("test.pdf", b"%PDF-1.4 test", "application/pdf")})
        assert resp.status_code == 200
        assert len(resp.headers["X-Document-Hash"]) == 16
        assert resp.headers["X-Input-Size-Bytes"] == "13"
        assert resp.headers["X-Images-Captioned"] == "3"
        assert resp.headers["X-Processing-Pipeline"] == "docling,captioning"

    def test_markdown_response_has_audit_headers(self, client):
        with patch("app.app.convert", new_callable=AsyncMock, return_value=_mock_result()):
            resp = client.post(
                "/convert",
                files={"file": ("test.pdf", b"%PDF-1.4 test", "application/pdf")},
                headers={"Accept": "text/markdown"},
            )
        assert resp.status_code == 200
        assert len(resp.headers["X-Document-Hash"]) == 16


class TestEchoHeaders:
    def test_echoes_whitelisted_headers(self, client):
        with patch("app.app.convert", new_callable=AsyncMock, return_value=_mock_result()):
            resp = client.post(
                "/convert",
                files={"file": ("test.pdf", b"%PDF-1.4 test", "application/pdf")},
                headers={
                    "X-Subscription-Id": "sub_123",
                    "X-Org-Id": "org_456",
                    "X-Request-Id": "req_789",
                },
            )
        assert resp.headers["X-Subscription-Id"] == "sub_123"
        assert resp.headers["X-Org-Id"] == "org_456"
        assert resp.headers["X-Request-Id"] == "req_789"

    def test_does_not_echo_unknown_headers(self, client):
        with patch("app.app.convert", new_callable=AsyncMock, return_value=_mock_result()):
            resp = client.post(
                "/convert",
                files={"file": ("test.pdf", b"%PDF-1.4 test", "application/pdf")},
                headers={"X-Secret-Internal": "should_not_appear"},
            )
        assert "X-Secret-Internal" not in resp.headers


class TestErrorSanitisation:
    def test_production_sanitises_500(self, client):
        from app.services.image_postprocess import CaptioningUpstreamError
        err = CaptioningUpstreamError(0, Exception("Connection refused to http://captioning:8080"))
        with patch("app.app.convert", new_callable=AsyncMock, side_effect=err):
            with patch("app.app.DEBUG_MODE", False):
                resp = client.post("/convert", files={"file": ("test.pdf", b"%PDF-1.4 test", "application/pdf")})
        assert resp.status_code == 500
        assert "captioning:8080" not in resp.json()["detail"]
        assert resp.json()["detail"] == "Internal processing error"

    def test_debug_shows_full_error(self, client):
        from app.services.image_postprocess import CaptioningUpstreamError
        err = CaptioningUpstreamError(0, Exception("Connection refused to http://captioning:8080"))
        with patch("app.app.convert", new_callable=AsyncMock, side_effect=err):
            with patch("app.app.DEBUG_MODE", True):
                resp = client.post("/convert", files={"file": ("test.pdf", b"%PDF-1.4 test", "application/pdf")})
        assert resp.status_code == 500
        assert "captioning:8080" in resp.json()["detail"]

    def test_production_sanitises_502(self, client):
        from fastapi import HTTPException
        with patch("app.app.convert", new_callable=AsyncMock, side_effect=HTTPException(502, detail="Docling error: internal traceback here")):
            with patch("app.app.DEBUG_MODE", False):
                resp = client.post("/convert", files={"file": ("test.pdf", b"%PDF-1.4 test", "application/pdf")})
        assert resp.status_code == 502
        assert "traceback" not in resp.json()["detail"]
        assert resp.json()["detail"] == "Upstream service error"

    def test_400_not_sanitised(self, client):
        from app.convert import UnsupportedFormat
        with patch("app.app.convert", new_callable=AsyncMock, side_effect=UnsupportedFormat("video/mp4")):
            with patch("app.app.DEBUG_MODE", False):
                resp = client.post("/convert", files={"file": ("test.mp4", b"fake", "video/mp4")})
        assert resp.status_code == 400
        assert "video/mp4" in resp.json()["detail"]


class TestQueueMode:
    """Tests for QUEUE_MODE=true — mocks enqueue, await_result, and blobstore."""

    @pytest.fixture
    def queue_client(self):
        from app.app import app
        return TestClient(app)

    def _encrypted_output(self, key):
        """Build encrypted output blob content."""
        payload = json.dumps({"markdown": "# Hello", "metadata": {"input_bytes": 100}})
        return encrypt(payload.encode(), key)

    def test_queue_mode_returns_200(self, queue_client):
        import os
        key = os.urandom(32)
        ok_signal = JobResult(job_id="abc123", status="ok", status_code=200)
        encrypted_output = self._encrypted_output(key)
        with patch("app.app.QUEUE_MODE", True), \
             patch("app.quota.get_redis", new_callable=AsyncMock, return_value=AsyncMock()), \
             patch("app.app.blobstore") as mock_blob, \
             patch("app.app.enqueue", new_callable=AsyncMock, return_value="abc123"), \
             patch("app.app.await_result", new_callable=AsyncMock, return_value=ok_signal), \
             patch("app.crypto.ENCRYPTION_KEY", key):
            mock_blob.put = AsyncMock()
            mock_blob.get = AsyncMock(return_value=encrypted_output)
            mock_blob.delete = AsyncMock()
            resp = queue_client.post(
                "/convert",
                files={"file": ("test.html", b"<p>hello</p>", "text/html")},
            )
        assert resp.status_code == 200
        assert "markdown" in resp.json()

    def test_queue_mode_returns_202_on_timeout(self, queue_client):
        with patch("app.app.QUEUE_MODE", True), \
             patch("app.quota.get_redis", new_callable=AsyncMock, return_value=AsyncMock()), \
             patch("app.app.blobstore") as mock_blob, \
             patch("app.app.enqueue", new_callable=AsyncMock, return_value="abc123"), \
             patch("app.app.await_result", new_callable=AsyncMock, return_value=None), \
             patch("app.crypto.ENCRYPTION_KEY", b"\x00" * 32):
            mock_blob.put = AsyncMock()
            resp = queue_client.post(
                "/convert",
                files={"file": ("test.html", b"<p>hello</p>", "text/html")},
            )
        assert resp.status_code == 202
        assert "job_id" in resp.json()
        assert "Location" in resp.headers

    def test_queue_mode_error_raises(self, queue_client):
        error_result = JobResult(job_id="abc", status="error", error_detail="Unsupported format", status_code=400)
        with patch("app.app.QUEUE_MODE", True), \
             patch("app.quota.get_redis", new_callable=AsyncMock, return_value=AsyncMock()), \
             patch("app.app.blobstore") as mock_blob, \
             patch("app.app.enqueue", new_callable=AsyncMock, return_value="abc"), \
             patch("app.app.await_result", new_callable=AsyncMock, return_value=error_result), \
             patch("app.crypto.ENCRYPTION_KEY", b"\x00" * 32):
            mock_blob.put = AsyncMock()
            resp = queue_client.post(
                "/convert",
                files={"file": ("test.pdf", b"%PDF-1.4 test", "application/pdf")},
            )
        assert resp.status_code == 400


class TestPollResult:
    @pytest.fixture
    def client(self):
        from app.app import app
        return TestClient(app)

    def test_poll_returns_result(self, client):
        import os
        key = os.urandom(32)
        payload = json.dumps({"markdown": "# Hello", "metadata": {}})
        encrypted_output = encrypt(payload.encode(), key)
        ok_signal = JobResult(job_id="abc", status="ok", status_code=200)
        with patch("app.quota.get_redis", new_callable=AsyncMock, return_value=AsyncMock()), \
             patch("app.app.get_result", new_callable=AsyncMock, return_value=ok_signal), \
             patch("app.app.blobstore") as mock_blob, \
             patch("app.crypto.ENCRYPTION_KEY", key):
            mock_blob.get = AsyncMock(return_value=encrypted_output)
            mock_blob.delete = AsyncMock()
            resp = client.get("/result/abc")
        assert resp.status_code == 200
        assert "markdown" in resp.json()

    def test_poll_returns_404_when_missing(self, client):
        with patch("app.quota.get_redis", new_callable=AsyncMock, return_value=AsyncMock()), \
             patch("app.app.get_result", new_callable=AsyncMock, return_value=None):
            resp = client.get("/result/abc")
        assert resp.status_code == 404

    def test_poll_returns_error(self, client):
        result = JobResult(job_id="abc", status="error", error_detail="Something broke", status_code=502)
        with patch("app.quota.get_redis", new_callable=AsyncMock, return_value=AsyncMock()), \
             patch("app.app.get_result", new_callable=AsyncMock, return_value=result):
            resp = client.get("/result/abc")
        assert resp.status_code == 502
