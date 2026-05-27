"""Unit tests for the filesystem blob store."""
from unittest.mock import patch

import pytest

from app import blobstore


@pytest.fixture
def tmp_store(tmp_path):
    with patch.object(blobstore, "BLOB_STORE_URL", f"file://{tmp_path}"):
        yield tmp_path


class TestFilesystemBlobStore:
    @pytest.mark.asyncio
    async def test_put_and_get(self, tmp_store):
        await blobstore.put("job1/input", b"hello")
        result = await blobstore.get("job1/input")
        assert result == b"hello"

    @pytest.mark.asyncio
    async def test_get_missing_returns_none(self, tmp_store):
        result = await blobstore.get("nonexistent/key")
        assert result is None

    @pytest.mark.asyncio
    async def test_delete(self, tmp_store):
        await blobstore.put("job1/input", b"hello")
        await blobstore.delete("job1/input")
        assert await blobstore.get("job1/input") is None

    @pytest.mark.asyncio
    async def test_delete_missing_does_not_raise(self, tmp_store):
        await blobstore.delete("nonexistent/key")

    @pytest.mark.asyncio
    async def test_large_blob(self, tmp_store):
        data = b"x" * (5 * 1024 * 1024)  # 5MB
        await blobstore.put("job1/output", data)
        assert await blobstore.get("job1/output") == data

    @pytest.mark.asyncio
    async def test_no_store_url_raises(self):
        with patch.object(blobstore, "BLOB_STORE_URL", ""):
            with pytest.raises(RuntimeError):
                await blobstore.put("key", b"data")
