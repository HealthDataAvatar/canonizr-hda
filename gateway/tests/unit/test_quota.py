"""Unit tests for quota enforcement — mocks quota module, no Redis needed."""
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.response import ConvertResult


def _mock_result():
    return ConvertResult(
        markdown="# Hello",
        detected_type="application/pdf",
        actions=["docling"],
        input_bytes=100,
        input_hash="abc123",
    )


@pytest.fixture
def client():
    from app.app import app
    return TestClient(app)


class TestQuotaRejection:
    def test_over_quota_returns_429(self, client):
        with patch("app.quota.check_quota", new_callable=AsyncMock, return_value="Quota exceeded"):
            resp = client.post(
                "/convert",
                files={"file": ("test.pdf", b"%PDF-1.4 test", "application/pdf")},
                headers={"X-Subscription-Id": "sub_1"},
            )
        assert resp.status_code == 429

    def test_under_quota_allows_request(self, client):
        with patch("app.quota.check_quota", new_callable=AsyncMock, return_value=None):
            with patch("app.app.convert", new_callable=AsyncMock, return_value=_mock_result()):
                with patch("app.quota.record_usage", new_callable=AsyncMock) as mock_record:
                    resp = client.post(
                        "/convert",
                        files={"file": ("test.pdf", b"%PDF-1.4 test", "application/pdf")},
                        headers={"X-Subscription-Id": "sub_1"},
                    )
        assert resp.status_code == 200
        mock_record.assert_called_once()

    def test_no_subscription_header_skips_quota(self, client):
        with patch("app.app.convert", new_callable=AsyncMock, return_value=_mock_result()):
            with patch("app.quota.check_quota", new_callable=AsyncMock) as mock_check:
                resp = client.post(
                    "/convert",
                    files={"file": ("test.pdf", b"%PDF-1.4 test", "application/pdf")},
                )
        assert resp.status_code == 200
        mock_check.assert_not_called()

    def test_rejection_returns_429(self, client):
        with patch("app.quota.check_quota", new_callable=AsyncMock, return_value="Too many rejected requests — try again later"):
            resp = client.post(
                "/convert",
                files={"file": ("test.pdf", b"%PDF-1.4 test", "application/pdf")},
                headers={"X-Subscription-Id": "sub_1"},
            )
        assert resp.status_code == 429
