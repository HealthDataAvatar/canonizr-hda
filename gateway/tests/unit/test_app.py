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


def _patch_auth():
    """Patch the auth layer to accept any Bearer token and return 'sub_1'."""
    return patch("app.app.resolve_api_key", new_callable=AsyncMock, return_value="sub_1")


AUTH_HEADERS = {"Authorization": "Bearer pk_test"}


class TestFileSizeLimit:
    def test_returns_413_for_oversized_file(self, client):
        with (
            patch("app.app._svc", AsyncMock()),
            patch("app.app._table_service", AsyncMock()),
            patch("app.app._redis", AsyncMock()),
            patch("app.app.MAX_FILE_SIZE", 10),
            _patch_auth(),
        ):
            resp = client.post(
                "/v1/jobs",
                files={"file": ("test.txt", b"x" * 20, "text/plain")},
                headers=AUTH_HEADERS,
            )
        assert resp.status_code == 413


class TestMissingApiKey:
    def test_returns_401_without_auth_header(self, client):
        with patch("app.app._svc", AsyncMock()):
            resp = client.post(
                "/v1/jobs",
                files={"file": ("test.txt", b"hello", "text/plain")},
            )
        assert resp.status_code == 401

    def test_returns_401_with_invalid_key(self, client):
        with (
            patch("app.app._svc", AsyncMock()),
            patch("app.app._table_service", AsyncMock()),
            patch("app.app._redis", AsyncMock()),
            patch("app.app.resolve_api_key", new_callable=AsyncMock, return_value=None),
        ):
            resp = client.post(
                "/v1/jobs",
                files={"file": ("test.txt", b"hello", "text/plain")},
                headers={"Authorization": "Bearer bad_key"},
            )
        assert resp.status_code == 401


class TestErrorSanitisation:
    def test_production_sanitises_500(self, client):
        with (
            patch("app.app._svc", AsyncMock()),
            patch("app.app._table_service", AsyncMock()),
            patch("app.app._redis", AsyncMock()),
            _patch_auth(),
            patch(
                "app.app.accept_canonize",
                new_callable=AsyncMock,
                side_effect=HTTPException(500, detail="traceback here"),
            ),
            patch("app.app.DEBUG_MODE", False),
        ):
            resp = client.post(
                "/v1/jobs",
                files={"file": ("test.pdf", b"hello", "application/pdf")},
                headers=AUTH_HEADERS,
            )
        assert resp.status_code == 500
        assert "traceback" not in resp.json()["detail"]

    def test_debug_shows_full_error(self, client):
        with (
            patch("app.app._svc", AsyncMock()),
            patch("app.app._table_service", AsyncMock()),
            patch("app.app._redis", AsyncMock()),
            _patch_auth(),
            patch(
                "app.app.accept_canonize",
                new_callable=AsyncMock,
                side_effect=HTTPException(500, detail="traceback here"),
            ),
            patch("app.app.DEBUG_MODE", True),
        ):
            resp = client.post(
                "/v1/jobs",
                files={"file": ("test.pdf", b"hello", "application/pdf")},
                headers=AUTH_HEADERS,
            )
        assert resp.status_code == 500
        assert "traceback" in resp.json()["detail"]
