"""Unit tests for the worker — mocks convert(), blobstore, and Redis."""
import os
from unittest.mock import AsyncMock, patch

import pytest

from app.crypto import encrypt
from app.queue import Job
from app.response import ConvertResult
from app.worker import process_job


@pytest.fixture
def key():
    return os.urandom(32)


@pytest.fixture
def sample_job():
    return Job.create(
        sub_id="sub_1",
        mime_type="text/html",
        filename="test.html",
        deadline_seconds=60.0,
    )


class TestProcessJob:
    @pytest.mark.asyncio
    async def test_successful_conversion(self, sample_job, key):
        encrypted_input = encrypt(b"<p>hello world</p>", key)
        mock_result = ConvertResult(
            markdown="# Hello",
            detected_type="text/html",
            actions=["passthrough"],
        )
        with patch("app.worker.blobstore") as mock_blob, \
             patch("app.worker.convert", new_callable=AsyncMock, return_value=mock_result):
            mock_blob.get = AsyncMock(return_value=encrypted_input)
            mock_blob.put = AsyncMock()
            mock_blob.delete = AsyncMock()
            result = await process_job(sample_job, key)
        assert result.status == "ok"
        assert result.status_code == 200
        mock_blob.put.assert_called_once()  # wrote output blob
        mock_blob.delete.assert_called_once()  # cleaned up input blob

    @pytest.mark.asyncio
    async def test_unsupported_format(self, sample_job, key):
        encrypted_input = encrypt(b"fake", key)
        from app.convert import UnsupportedFormat
        with patch("app.worker.blobstore") as mock_blob, \
             patch("app.worker.convert", new_callable=AsyncMock, side_effect=UnsupportedFormat("video/mp4")):
            mock_blob.get = AsyncMock(return_value=encrypted_input)
            mock_blob.delete = AsyncMock()
            result = await process_job(sample_job, key)
        assert result.status == "error"
        assert result.status_code == 400
        mock_blob.delete.assert_called_once()

    @pytest.mark.asyncio
    async def test_service_not_configured(self, sample_job, key):
        encrypted_input = encrypt(b"fake", key)
        from app.convert import ServiceNotConfigured
        with patch("app.worker.blobstore") as mock_blob, \
             patch("app.worker.convert", new_callable=AsyncMock, side_effect=ServiceNotConfigured("captioning")):
            mock_blob.get = AsyncMock(return_value=encrypted_input)
            mock_blob.delete = AsyncMock()
            result = await process_job(sample_job, key)
        assert result.status == "error"
        assert result.status_code == 422

    @pytest.mark.asyncio
    async def test_unexpected_exception(self, sample_job, key):
        encrypted_input = encrypt(b"fake", key)
        with patch("app.worker.blobstore") as mock_blob, \
             patch("app.worker.convert", new_callable=AsyncMock, side_effect=RuntimeError("boom")):
            mock_blob.get = AsyncMock(return_value=encrypted_input)
            mock_blob.delete = AsyncMock()
            result = await process_job(sample_job, key)
        assert result.status == "error"
        assert result.status_code == 500

    @pytest.mark.asyncio
    async def test_missing_input_blob(self, sample_job, key):
        with patch("app.worker.blobstore") as mock_blob:
            mock_blob.get = AsyncMock(return_value=None)
            result = await process_job(sample_job, key)
        assert result.status == "error"
        assert result.status_code == 500
        assert "not found" in result.error_detail.lower()
