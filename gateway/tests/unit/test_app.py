"""Unit tests for the gateway API: async 202 flow, quota, dedup, polling, error sanitisation."""

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


def _mock_redis():
    """Return a mock Redis where check_dedupe returns None (no dedup hit)."""
    r = AsyncMock()
    r.get.return_value = None  # no dedupe hit by default
    return r


class TestConvert:
    def test_always_returns_202(self, client):
        with (
            patch("app.app._get_redis", new_callable=AsyncMock, return_value=_mock_redis()),
            patch("app.app.blobstore") as mock_blob,
            patch("app.app.enqueue", new_callable=AsyncMock, return_value="abc"),
            patch("app.app.set_dedupe", new_callable=AsyncMock),
            patch("app.crypto.ENCRYPTION_KEY", b"\x00" * 32),
        ):
            mock_blob.put = AsyncMock()
            resp = client.post(
                "/convert",
                files={"file": ("test.html", b"<p>hello</p>", "text/html")},
            )
        assert resp.status_code == 202
        body = resp.json()
        assert "job_id" in body
        assert "poll_url" in body
        assert "estimated_seconds" in body
        assert "Location" in resp.headers
        assert "Retry-After" in resp.headers

    def test_returns_413_for_oversized_file(self, client):
        with patch("app.app.MAX_FILE_SIZE", 10):
            resp = client.post(
                "/convert",
                files={"file": ("test.txt", b"x" * 20, "text/plain")},
            )
        assert resp.status_code == 413


class TestDeduplication:
    def test_returns_existing_job_on_dedupe_hit(self, client):
        r = _mock_redis()
        r.get.return_value = "existing-job-id"  # dedupe hit
        with (
            patch("app.app._get_redis", new_callable=AsyncMock, return_value=r),
            patch("app.app.enqueue", new_callable=AsyncMock) as mock_enqueue,
            patch("app.crypto.ENCRYPTION_KEY", b"\x00" * 32),
        ):
            resp = client.post(
                "/convert",
                files={"file": ("test.txt", b"hello", "text/plain")},
                headers={"X-Subscription-Id": "sub_1"},
            )
        assert resp.status_code == 202
        assert resp.json()["job_id"] == "existing-job-id"
        mock_enqueue.assert_not_called()

    def test_no_dedupe_without_subscription(self, client):
        with (
            patch("app.app._get_redis", new_callable=AsyncMock, return_value=_mock_redis()),
            patch("app.app.blobstore") as mock_blob,
            patch("app.app.enqueue", new_callable=AsyncMock, return_value="new-job"),
            patch("app.app.set_dedupe", new_callable=AsyncMock),
            patch("app.app.check_dedupe", new_callable=AsyncMock) as mock_check,
            patch("app.crypto.ENCRYPTION_KEY", b"\x00" * 32),
        ):
            mock_blob.put = AsyncMock()
            resp = client.post(
                "/convert",
                files={"file": ("test.txt", b"hello", "text/plain")},
            )
        assert resp.status_code == 202
        mock_check.assert_not_called()

    def test_sets_dedupe_key_on_new_job(self, client):
        with (
            patch("app.app._get_redis", new_callable=AsyncMock, return_value=_mock_redis()),
            patch("app.app.blobstore") as mock_blob,
            patch("app.app.enqueue", new_callable=AsyncMock, return_value="abc"),
            patch("app.app.set_dedupe", new_callable=AsyncMock) as mock_set,
            patch("app.crypto.ENCRYPTION_KEY", b"\x00" * 32),
        ):
            mock_blob.put = AsyncMock()
            resp = client.post(
                "/convert",
                files={"file": ("test.txt", b"hello", "text/plain")},
                headers={"X-Subscription-Id": "sub_1"},
            )
        assert resp.status_code == 202
        mock_set.assert_called_once()


class TestQuota:
    def test_over_quota_returns_429(self, client):
        mock_quota = AsyncMock()
        mock_quota.check = AsyncMock(return_value="Quota exceeded")
        with (
            patch("app.app._quota", mock_quota),
            patch("app.app._get_redis", new_callable=AsyncMock, return_value=_mock_redis()),
            patch("app.crypto.ENCRYPTION_KEY", b"\x00" * 32),
        ):
            resp = client.post(
                "/convert",
                files={"file": ("test.pdf", b"%PDF-1.4 test", "application/pdf")},
                headers={"X-Subscription-Id": "sub_1"},
            )
        assert resp.status_code == 429

    def test_records_usage_immediately_on_accept(self, client):
        mock_quota = AsyncMock()
        mock_quota.check = AsyncMock(return_value=None)
        with (
            patch("app.app._quota", mock_quota),
            patch("app.app._get_redis", new_callable=AsyncMock, return_value=_mock_redis()),
            patch("app.app.blobstore") as mock_blob,
            patch("app.app.enqueue", new_callable=AsyncMock, return_value="abc"),
            patch("app.app.set_dedupe", new_callable=AsyncMock),
            patch("app.crypto.ENCRYPTION_KEY", b"\x00" * 32),
        ):
            mock_blob.put = AsyncMock()
            resp = client.post(
                "/convert",
                files={"file": ("test.txt", b"hello world", "text/plain")},
                headers={"X-Subscription-Id": "sub_1"},
            )
        assert resp.status_code == 202
        mock_quota.record.assert_called_once_with("sub_1", 11)  # len(b"hello world")

    def test_no_subscription_header_skips_quota(self, client):
        mock_quota = AsyncMock()
        with (
            patch("app.app._quota", mock_quota),
            patch("app.app._get_redis", new_callable=AsyncMock, return_value=_mock_redis()),
            patch("app.app.blobstore") as mock_blob,
            patch("app.app.enqueue", new_callable=AsyncMock, return_value="abc"),
            patch("app.app.set_dedupe", new_callable=AsyncMock),
            patch("app.crypto.ENCRYPTION_KEY", b"\x00" * 32),
        ):
            mock_blob.put = AsyncMock()
            resp = client.post(
                "/convert",
                files={"file": ("test.pdf", b"%PDF-1.4 test", "application/pdf")},
            )
        assert resp.status_code == 202
        mock_quota.check.assert_not_called()


class TestPollResult:
    def test_returns_200_when_ready(self, client):
        key = os.urandom(32)
        ok_signal = JobResult(job_id="abc", status="ok", status_code=200)
        with (
            patch("app.app._get_redis", new_callable=AsyncMock, return_value=AsyncMock()),
            patch("app.app.get_result", new_callable=AsyncMock, return_value=ok_signal),
            patch("app.app.blobstore") as mock_blob,
            patch("app.crypto.ENCRYPTION_KEY", key),
        ):
            mock_blob.get = AsyncMock(return_value=_encrypted_output(key))
            resp = client.get("/result/abc")
        assert resp.status_code == 200
        assert "markdown" in resp.json()

    def test_returns_202_when_processing(self, client):
        with (
            patch("app.app._get_redis", new_callable=AsyncMock, return_value=AsyncMock()),
            patch("app.app.get_result", new_callable=AsyncMock, return_value=None),
        ):
            resp = client.get("/result/abc")
        assert resp.status_code == 202
        assert resp.json()["status"] == "processing"

    def test_returns_410_when_blob_expired(self, client):
        ok_signal = JobResult(job_id="abc", status="ok", status_code=200)
        with (
            patch("app.app._get_redis", new_callable=AsyncMock, return_value=AsyncMock()),
            patch("app.app.get_result", new_callable=AsyncMock, return_value=ok_signal),
            patch("app.app.blobstore") as mock_blob,
            patch("app.crypto.ENCRYPTION_KEY", b"\x00" * 32),
        ):
            mock_blob.get = AsyncMock(return_value=None)
            resp = client.get("/result/abc")
        assert resp.status_code == 410

    def test_returns_500_on_error(self, client):
        result = JobResult(job_id="abc", status="error", error_detail="broke", status_code=502)
        with (
            patch("app.app._get_redis", new_callable=AsyncMock, return_value=AsyncMock()),
            patch("app.app.get_result", new_callable=AsyncMock, return_value=result),
        ):
            resp = client.get("/result/abc")
        assert resp.status_code == 500
        assert resp.json()["status"] == "error"

    def test_does_not_delete_blob_on_read(self, client):
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
            client.get("/result/abc")
        mock_blob.delete.assert_not_called()


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
