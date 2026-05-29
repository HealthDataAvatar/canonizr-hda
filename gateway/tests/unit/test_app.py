"""Unit tests for the FastAPI wiring layer — file size limits, error sanitisation.

Business logic is tested in test_handlers.py. These tests only verify
the thin wiring in app.py.
"""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from app.app import app

    return TestClient(app)


class TestFileSizeLimit:
    def test_returns_413_for_oversized_file(self, client):
        with (
            patch("app.app._svc", AsyncMock()),
            patch("app.app.MAX_FILE_SIZE", 10),
        ):
            resp = client.post(
                "/v1/jobs",
                files={"file": ("test.txt", b"x" * 20, "text/plain")},
                headers={"X-Subscription-Id": "sub_1"},
            )
        assert resp.status_code == 413


class TestMissingSubscription:
    def test_returns_401_without_subscription_header(self, client):
        with patch("app.app._svc", AsyncMock()):
            resp = client.post(
                "/v1/jobs",
                files={"file": ("test.txt", b"hello", "text/plain")},
            )
        assert resp.status_code == 401


class TestErrorSanitisation:
    def test_production_sanitises_500(self, client):
        with (
            patch("app.app._svc", AsyncMock()),
            patch(
                "app.app.accept_job", new_callable=AsyncMock, side_effect=HTTPException(500, detail="traceback here")
            ),
            patch("app.app.DEBUG_MODE", False),
        ):
            resp = client.post(
                "/v1/jobs",
                files={"file": ("test.pdf", b"hello", "application/pdf")},
                headers={"X-Subscription-Id": "sub_1"},
            )
        assert resp.status_code == 500
        assert "traceback" not in resp.json()["detail"]

    def test_debug_shows_full_error(self, client):
        with (
            patch("app.app._svc", AsyncMock()),
            patch(
                "app.app.accept_job", new_callable=AsyncMock, side_effect=HTTPException(500, detail="traceback here")
            ),
            patch("app.app.DEBUG_MODE", True),
        ):
            resp = client.post(
                "/v1/jobs",
                files={"file": ("test.pdf", b"hello", "application/pdf")},
                headers={"X-Subscription-Id": "sub_1"},
            )
        assert resp.status_code == 500
        assert "traceback" in resp.json()["detail"]
