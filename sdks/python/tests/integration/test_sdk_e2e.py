"""End-to-end tests for the SDK against a real gateway stack.

Requires: docker compose -f docker-compose.sdk-test.yml up
Run with: cd sdks/python && uv run --extra test --extra integration pytest tests/integration -q
"""

from __future__ import annotations

import pytest

from canonizr import Canonizr, AsyncCanonizr, AuthError, UnsupportedFileError
from canonizr.cache import DiskCache

from .conftest import GATEWAY_URL, SeedCredentials

pytestmark = pytest.mark.integration


class TestSyncClient:
    def test_canonize_text_file(self, credentials: SeedCredentials, tmp_path):
        """Submit a plain text file, get markdown back."""
        f = tmp_path / "hello.txt"
        f.write_text("Hello, world!")

        with Canonizr(credentials.api_key, base_url=GATEWAY_URL, cache=False) as client:
            result = client.canonize(f)

        assert result.job_id
        assert result.status.status == "ok"
        assert len(result.artefacts) > 0

        # Should have a markdown artefact
        assert result.has("markdown")

    def test_canonize_and_fetch_artefact(self, credentials: SeedCredentials, tmp_path):
        """Submit, then fetch the markdown artefact content."""
        f = tmp_path / "doc.txt"
        f.write_text("Test document content for SDK.")

        with Canonizr(credentials.api_key, base_url=GATEWAY_URL, cache=False) as client:
            result = client.canonize(f)
            content = result.get("markdown")

        assert isinstance(content, bytes)
        text = content.decode()
        assert len(text) > 0

    def test_auth_error(self, tmp_path):
        """Bad API key should raise AuthError."""
        f = tmp_path / "doc.txt"
        f.write_text("content")

        with Canonizr("bad-key", base_url=GATEWAY_URL, cache=False) as client:
            with pytest.raises(AuthError):
                client.canonize(f)

    def test_unsupported_file(self, credentials: SeedCredentials, tmp_path):
        """Archive files should raise UnsupportedFileError."""
        f = tmp_path / "archive.zip"
        # Minimal ZIP file magic bytes
        f.write_bytes(b"PK\x03\x04" + b"\x00" * 26)

        with Canonizr(credentials.api_key, base_url=GATEWAY_URL, cache=False) as client:
            with pytest.raises(UnsupportedFileError):
                client.canonize(f)

    def test_get_status(self, credentials: SeedCredentials, tmp_path):
        """get_status on a completed job returns ok."""
        f = tmp_path / "doc.txt"
        f.write_text("status check")

        with Canonizr(credentials.api_key, base_url=GATEWAY_URL, cache=False) as client:
            result = client.canonize(f)
            status = client.get_status(result.job_id)

        assert status.status == "ok"
        assert status.job_id == result.job_id

    def test_delete(self, credentials: SeedCredentials, tmp_path):
        """Delete a job after canonizing."""
        f = tmp_path / "doc.txt"
        f.write_text("delete me")

        with Canonizr(credentials.api_key, base_url=GATEWAY_URL, cache=False) as client:
            result = client.canonize(f)
            client.delete(result.job_id)


class TestCacheIntegration:
    def test_cache_hit_skips_second_submission(self, credentials: SeedCredentials, tmp_path):
        """Second canonize of same file should be a cache hit — no new job ID."""
        cache = DiskCache(cache_dir=tmp_path / "cache")
        f = tmp_path / "doc.txt"
        f.write_text("cache test content")

        with Canonizr(credentials.api_key, base_url=GATEWAY_URL, cache=cache) as client:
            result1 = client.canonize(f)
            result2 = client.canonize(f)

        # Cache hit returns the original job_id
        assert result1.job_id == result2.job_id

    def test_cached_artefact_persists(self, credentials: SeedCredentials, tmp_path):
        """Fetched artefacts should be cached on disk."""
        cache = DiskCache(cache_dir=tmp_path / "cache")
        f = tmp_path / "doc.txt"
        f.write_text("artefact cache test")

        with Canonizr(credentials.api_key, base_url=GATEWAY_URL, cache=cache) as client:
            result = client.canonize(f)
            content = result.get("markdown")

        # Verify the artefact is on disk
        file_hash = cache.file_hash(f.read_bytes())
        cached = cache.get_artefact(file_hash, "markdown")
        assert cached == content


class TestAsyncClient:
    async def test_canonize_async(self, credentials: SeedCredentials, tmp_path):
        """Async client should work end-to-end."""
        f = tmp_path / "doc.txt"
        f.write_text("async test")

        async with AsyncCanonizr(credentials.api_key, base_url=GATEWAY_URL, cache=False) as client:
            result = await client.canonize(f)

        assert result.job_id
        assert result.status.status == "ok"

    async def test_submit_then_poll(self, credentials: SeedCredentials, tmp_path):
        """Async submit + poll as separate steps."""
        f = tmp_path / "doc.txt"
        f.write_text("submit then poll")

        async with AsyncCanonizr(credentials.api_key, base_url=GATEWAY_URL, cache=False) as client:
            info = await client.submit(f)
            assert info.job_id

            status = await client.poll(info.job_id)
            assert status.status == "ok"
