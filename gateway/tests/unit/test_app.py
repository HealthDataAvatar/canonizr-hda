"""Unit tests for the /convert endpoint: quota, queue integration, polling, error sanitisation."""

import json
import os
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.crypto import encrypt
from app.queue import JobResult


@pytest.fixture
def client():
    from app.app import app

    return TestClient(app)


def _encrypted_output(key):
    payload = json.dumps({"markdown": "# Hello", "metadata": {"input_bytes": 100}})
    return encrypt(payload.encode(), key)


class TestConvert:
    def test_returns_200_when_worker_completes(self, client):
        key = os.urandom(32)
        ok_signal = JobResult(job_id="abc", status="ok", status_code=200)
        with (
            patch("app.app._get_redis", new_callable=AsyncMock, return_value=AsyncMock()),
            patch("app.app.blobstore") as mock_blob,
            patch("app.app.enqueue", new_callable=AsyncMock, return_value="abc"),
            patch("app.app.await_result", new_callable=AsyncMock, return_value=ok_signal),
            patch("app.crypto.ENCRYPTION_KEY", key),
        ):
            mock_blob.put = AsyncMock()
            mock_blob.get = AsyncMock(return_value=_encrypted_output(key))
            mock_blob.delete = AsyncMock()
            resp = client.post(
                "/convert",
                files={"file": ("test.html", b"<p>hello</p>", "text/html")},
            )
        assert resp.status_code == 200
        assert "markdown" in resp.json()

    def test_returns_202_on_timeout(self, client):
        with (
            patch("app.app._get_redis", new_callable=AsyncMock, return_value=AsyncMock()),
            patch("app.app.blobstore") as mock_blob,
            patch("app.app.enqueue", new_callable=AsyncMock, return_value="abc"),
            patch("app.app.await_result", new_callable=AsyncMock, return_value=None),
            patch("app.crypto.ENCRYPTION_KEY", b"\x00" * 32),
        ):
            mock_blob.put = AsyncMock()
            resp = client.post(
                "/convert",
                files={"file": ("test.html", b"<p>hello</p>", "text/html")},
            )
        assert resp.status_code == 202
        assert "job_id" in resp.json()
        assert "Location" in resp.headers

    def test_returns_error_from_worker(self, client):
        error_result = JobResult(job_id="abc", status="error", error_detail="Unsupported", status_code=400)
        with (
            patch("app.app._get_redis", new_callable=AsyncMock, return_value=AsyncMock()),
            patch("app.app.blobstore") as mock_blob,
            patch("app.app.enqueue", new_callable=AsyncMock, return_value="abc"),
            patch("app.app.await_result", new_callable=AsyncMock, return_value=error_result),
            patch("app.crypto.ENCRYPTION_KEY", b"\x00" * 32),
        ):
            mock_blob.put = AsyncMock()
            resp = client.post(
                "/convert",
                files={"file": ("test.pdf", b"%PDF-1.4 test", "application/pdf")},
            )
        assert resp.status_code == 400

    def test_returns_413_for_oversized_file(self, client):
        with patch("app.app.MAX_FILE_SIZE", 10):
            resp = client.post(
                "/convert",
                files={"file": ("test.txt", b"x" * 20, "text/plain")},
            )
        assert resp.status_code == 413


class TestQuota:
    def test_over_quota_returns_429(self, client):
        with patch("app.quota.check_quota", new_callable=AsyncMock, return_value="Quota exceeded"):
            resp = client.post(
                "/convert",
                files={"file": ("test.pdf", b"%PDF-1.4 test", "application/pdf")},
                headers={"X-Subscription-Id": "sub_1"},
            )
        assert resp.status_code == 429

    def test_no_subscription_header_skips_quota(self, client):
        key = os.urandom(32)
        ok_signal = JobResult(job_id="abc", status="ok", status_code=200)
        with (
            patch("app.quota.check_quota", new_callable=AsyncMock) as mock_check,
            patch("app.app._get_redis", new_callable=AsyncMock, return_value=AsyncMock()),
            patch("app.app.blobstore") as mock_blob,
            patch("app.app.enqueue", new_callable=AsyncMock, return_value="abc"),
            patch("app.app.await_result", new_callable=AsyncMock, return_value=ok_signal),
            patch("app.crypto.ENCRYPTION_KEY", key),
        ):
            mock_blob.put = AsyncMock()
            mock_blob.get = AsyncMock(return_value=_encrypted_output(key))
            mock_blob.delete = AsyncMock()
            resp = client.post(
                "/convert",
                files={"file": ("test.pdf", b"%PDF-1.4 test", "application/pdf")},
            )
        assert resp.status_code == 200
        mock_check.assert_not_called()


class TestEchoHeaders:
    def test_echoes_whitelisted_headers(self, client):
        key = os.urandom(32)
        ok_signal = JobResult(job_id="abc", status="ok", status_code=200)
        with (
            patch("app.app._get_redis", new_callable=AsyncMock, return_value=AsyncMock()),
            patch("app.app.blobstore") as mock_blob,
            patch("app.app.enqueue", new_callable=AsyncMock, return_value="abc"),
            patch("app.app.await_result", new_callable=AsyncMock, return_value=ok_signal),
            patch("app.crypto.ENCRYPTION_KEY", key),
        ):
            mock_blob.put = AsyncMock()
            mock_blob.get = AsyncMock(return_value=_encrypted_output(key))
            mock_blob.delete = AsyncMock()
            resp = client.post(
                "/convert",
                files={"file": ("test.pdf", b"%PDF-1.4 test", "application/pdf")},
                headers={
                    "X-Subscription-Id": "sub_123",
                    "X-Request-Id": "req_789",
                },
            )
        assert resp.headers["X-Subscription-Id"] == "sub_123"
        assert resp.headers["X-Request-Id"] == "req_789"

    def test_does_not_echo_unknown_headers(self, client):
        key = os.urandom(32)
        ok_signal = JobResult(job_id="abc", status="ok", status_code=200)
        with (
            patch("app.app._get_redis", new_callable=AsyncMock, return_value=AsyncMock()),
            patch("app.app.blobstore") as mock_blob,
            patch("app.app.enqueue", new_callable=AsyncMock, return_value="abc"),
            patch("app.app.await_result", new_callable=AsyncMock, return_value=ok_signal),
            patch("app.crypto.ENCRYPTION_KEY", key),
        ):
            mock_blob.put = AsyncMock()
            mock_blob.get = AsyncMock(return_value=_encrypted_output(key))
            mock_blob.delete = AsyncMock()
            resp = client.post(
                "/convert",
                files={"file": ("test.pdf", b"%PDF-1.4 test", "application/pdf")},
                headers={"X-Secret-Internal": "should_not_appear"},
            )
        assert "X-Secret-Internal" not in resp.headers


class TestErrorSanitisation:
    def test_production_sanitises_500(self, client):
        with (
            patch(
                "app.app._get_redis", new_callable=AsyncMock, side_effect=HTTPException(500, detail="traceback here")
            ),
            patch("app.app.DEBUG_MODE", False),
        ):
            resp = client.post("/convert", files={"file": ("test.pdf", b"%PDF-1.4 test", "application/pdf")})
        assert resp.status_code == 500
        assert "traceback" not in resp.json()["detail"]

    def test_debug_shows_full_error(self, client):
        with (
            patch(
                "app.app._get_redis", new_callable=AsyncMock, side_effect=HTTPException(500, detail="traceback here")
            ),
            patch("app.app.DEBUG_MODE", True),
        ):
            resp = client.post("/convert", files={"file": ("test.pdf", b"%PDF-1.4 test", "application/pdf")})
        assert resp.status_code == 500
        assert "traceback" in resp.json()["detail"]

    def test_400_not_sanitised(self, client):
        error_result = JobResult(job_id="abc", status="error", error_detail="Unsupported: video/mp4", status_code=400)
        with (
            patch("app.app._get_redis", new_callable=AsyncMock, return_value=AsyncMock()),
            patch("app.app.blobstore") as mock_blob,
            patch("app.app.enqueue", new_callable=AsyncMock, return_value="abc"),
            patch("app.app.await_result", new_callable=AsyncMock, return_value=error_result),
            patch("app.crypto.ENCRYPTION_KEY", b"\x00" * 32),
        ):
            mock_blob.put = AsyncMock()
            resp = client.post("/convert", files={"file": ("test.mp4", b"fake", "video/mp4")})
        assert resp.status_code == 400
        assert "video/mp4" in resp.json()["detail"]


class TestPollResult:
    def test_returns_result(self, client):
        key = os.urandom(32)
        ok_signal = JobResult(job_id="abc", status="ok", status_code=200)
        with (
            patch("app.app._get_redis", new_callable=AsyncMock, return_value=AsyncMock()),
            patch("app.app.get_result", new_callable=AsyncMock, return_value=ok_signal),
            patch("app.app.blobstore") as mock_blob,
            patch("app.crypto.ENCRYPTION_KEY", key),
        ):
            mock_blob.get = AsyncMock(return_value=_encrypted_output(key))
            mock_blob.delete = AsyncMock()
            resp = client.get("/result/abc")
        assert resp.status_code == 200
        assert "markdown" in resp.json()

    def test_returns_404_when_missing(self, client):
        with (
            patch("app.app._get_redis", new_callable=AsyncMock, return_value=AsyncMock()),
            patch("app.app.get_result", new_callable=AsyncMock, return_value=None),
        ):
            resp = client.get("/result/abc")
        assert resp.status_code == 404

    def test_returns_error(self, client):
        result = JobResult(job_id="abc", status="error", error_detail="broke", status_code=502)
        with (
            patch("app.app._get_redis", new_callable=AsyncMock, return_value=AsyncMock()),
            patch("app.app.get_result", new_callable=AsyncMock, return_value=result),
        ):
            resp = client.get("/result/abc")
        assert resp.status_code == 502
