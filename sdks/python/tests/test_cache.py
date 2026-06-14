"""Tests for the disk cache."""

from __future__ import annotations

from canonizr.cache import DiskCache
from canonizr.models import ArtefactMeta, JobStatus

from .fakes import FakeClock


def _sample_status() -> JobStatus:
    return JobStatus(
        job_id="abc123",
        status="ok",
        metadata={"detected_type": "application/pdf"},
        artefacts=(
            ArtefactMeta(name="markdown", mime_type="text/markdown", size_bytes=500, label="Extracted text"),
            ArtefactMeta(name="page-0", mime_type="image/png", size_bytes=20000, label="Page 1"),
        ),
        expires_at="2026-06-13T00:00:00Z",
    )


class TestDiskCache:
    def test_miss_returns_none(self, tmp_path):
        cache = DiskCache(cache_dir=tmp_path)
        assert cache.get_status("nonexistent") is None

    def test_roundtrip_status(self, tmp_path):
        cache = DiskCache(cache_dir=tmp_path)
        status = _sample_status()
        h = "deadbeef01234567"

        cache.put_status(h, status)
        got = cache.get_status(h)

        assert got is not None
        assert got.job_id == "abc123"
        assert got.status == "ok"
        assert len(got.artefacts) == 2
        assert got.artefacts[0].name == "markdown"

    def test_roundtrip_artefact(self, tmp_path):
        cache = DiskCache(cache_dir=tmp_path)
        h = "deadbeef01234567"

        cache.put_artefact(h, "markdown", b"# Hello")
        got = cache.get_artefact(h, "markdown")

        assert got == b"# Hello"

    def test_artefact_miss(self, tmp_path):
        cache = DiskCache(cache_dir=tmp_path)
        assert cache.get_artefact("nope", "markdown") is None

    def test_artefact_path(self, tmp_path):
        cache = DiskCache(cache_dir=tmp_path)
        h = "deadbeef01234567"

        assert cache.artefact_path(h, "page-0") is None

        cache.put_artefact(h, "page-0", b"png bytes")
        path = cache.artefact_path(h, "page-0")

        assert path is not None
        assert path.read_bytes() == b"png bytes"

    def test_evict_removes_entry(self, tmp_path):
        cache = DiskCache(cache_dir=tmp_path)
        h = "deadbeef01234567"

        cache.put_status(h, _sample_status())
        cache.put_artefact(h, "markdown", b"content")

        cache.evict(h)

        assert cache.get_status(h) is None
        assert cache.get_artefact(h, "markdown") is None

    def test_lru_eviction(self, tmp_path):
        clock = FakeClock()
        cache = DiskCache(cache_dir=tmp_path, max_entries=3, clock=clock)

        for i in range(5):
            clock.advance(1.0)
            cache.put_status(f"hash-{i}", _sample_status())

        # Should have evicted hash-0 and hash-1
        assert cache.get_status("hash-0") is None
        assert cache.get_status("hash-1") is None
        # hash-2, hash-3, hash-4 should remain
        assert cache.get_status("hash-2") is not None
        assert cache.get_status("hash-4") is not None

    def test_file_hash_matches_gateway(self, tmp_path):
        """Ensure we use the same hash algorithm as the gateway."""
        import xxhash

        cache = DiskCache(cache_dir=tmp_path)
        data = b"test document content"

        sdk_hash = cache.file_hash(data)
        gateway_hash = xxhash.xxh3_64_hexdigest(data)

        assert sdk_hash == gateway_hash


class TestDiskCacheCorruption:
    def test_corrupted_manifest_returns_none(self, tmp_path):
        cache = DiskCache(cache_dir=tmp_path)
        h = "corrupted"
        entry_dir = tmp_path / h
        entry_dir.mkdir()
        (entry_dir / "manifest.json").write_text("not valid json {{{")

        assert cache.get_status(h) is None
