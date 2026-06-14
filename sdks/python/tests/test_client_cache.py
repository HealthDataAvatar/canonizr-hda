"""Tests that the client integrates correctly with the disk cache."""

from __future__ import annotations

from canonizr import Canonizr
from canonizr._transport import Response
from canonizr.cache import DiskCache

from .fakes import FakeTransport, json_response, json_response_with_headers

SUBMIT_OK = json_response(202, {
    "job_id": "abc123",
    "poll_url": "/v1/canonize/abc123",
    "estimated_seconds": 5,
    "input_bytes": 1000,
    "billable_units": 1,
})

POLL_OK = json_response(200, {
    "job_id": "abc123",
    "status": "ok",
    "metadata": {"detected_type": "application/pdf", "input_bytes": 1000, "input_hash": "deadbeef"},
    "artefacts": [
        {"name": "markdown", "mime_type": "text/markdown", "size_bytes": 500, "label": "Extracted text"},
    ],
})

ARTEFACT_BYTES = b"# Cached markdown content"


class TestCacheHit:
    def test_second_call_skips_api(self, tmp_path):
        cache = DiskCache(cache_dir=tmp_path / "cache")
        t = FakeTransport()
        t.enqueue(SUBMIT_OK, POLL_OK)
        client = Canonizr(transport=t, cache=cache, timeout=5.0)

        f = tmp_path / "doc.pdf"
        f.write_bytes(b"pdf content")

        # First call — hits API
        result1 = client.canonize(f)
        assert result1.job_id == "abc123"
        assert len(t.requests) == 2  # POST + GET

        # Second call — cache hit, no new requests
        result2 = client.canonize(f)
        assert result2.job_id == "abc123"
        assert len(t.requests) == 2  # no additional requests

    def test_cached_artefact_skips_api(self, tmp_path):
        cache = DiskCache(cache_dir=tmp_path / "cache")
        t = FakeTransport()
        artefact_resp = Response(status_code=200, body=ARTEFACT_BYTES, headers={})
        t.enqueue(SUBMIT_OK, POLL_OK, artefact_resp)
        client = Canonizr(transport=t, cache=cache, timeout=5.0)

        f = tmp_path / "doc.pdf"
        f.write_bytes(b"pdf content")

        # First canonize + first artefact fetch
        result1 = client.canonize(f)
        content1 = result1.get("markdown")
        assert content1 == ARTEFACT_BYTES
        assert len(t.requests) == 3  # POST + poll GET + artefact GET

        # Second canonize — cache hit for manifest
        result2 = client.canonize(f)
        # Artefact also cached — no new request
        content2 = result2.get("markdown")
        assert content2 == ARTEFACT_BYTES
        assert len(t.requests) == 3  # still 3, no new requests

    def test_artefact_cache_miss_fetches_from_api(self, tmp_path):
        cache = DiskCache(cache_dir=tmp_path / "cache")
        t = FakeTransport()
        artefact_resp = Response(status_code=200, body=ARTEFACT_BYTES, headers={})
        t.enqueue(SUBMIT_OK, POLL_OK, artefact_resp)
        client = Canonizr(transport=t, cache=cache, timeout=5.0)

        f = tmp_path / "doc.pdf"
        f.write_bytes(b"pdf content")

        # First canonize caches manifest but not artefacts
        result1 = client.canonize(f)
        assert len(t.requests) == 2

        # Second canonize — cache hit for manifest, miss for artefact
        result2 = client.canonize(f)
        assert len(t.requests) == 2  # no new requests yet

        # Now fetch artefact — should hit API since not yet cached
        content = result2.get("markdown")
        assert content == ARTEFACT_BYTES
        assert len(t.requests) == 3  # one new artefact GET


class TestCacheDisabled:
    def test_always_hits_api(self, tmp_path):
        t = FakeTransport()
        t.enqueue(SUBMIT_OK, POLL_OK, SUBMIT_OK, POLL_OK)
        client = Canonizr(transport=t, cache=False, timeout=5.0)

        f = tmp_path / "doc.pdf"
        f.write_bytes(b"pdf content")

        client.canonize(f)
        client.canonize(f)

        assert len(t.requests) == 4  # 2x (POST + GET)


class TestDifferentFiles:
    def test_different_content_no_cache_hit(self, tmp_path):
        cache = DiskCache(cache_dir=tmp_path / "cache")
        t = FakeTransport()
        t.enqueue(SUBMIT_OK, POLL_OK, SUBMIT_OK, POLL_OK)
        client = Canonizr(transport=t, cache=cache, timeout=5.0)

        f1 = tmp_path / "doc1.pdf"
        f1.write_bytes(b"content A")
        f2 = tmp_path / "doc2.pdf"
        f2.write_bytes(b"content B")

        client.canonize(f1)
        client.canonize(f2)

        assert len(t.requests) == 4  # both hit API
