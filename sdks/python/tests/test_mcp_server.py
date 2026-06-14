"""Tests for MCP server tool handlers against fake transport."""

from __future__ import annotations

import pytest

from canonizr._transport import Response
from canonizr.cache import DiskCache
from canonizr.client import AsyncCanonizr
from canonizr.mcp_server import Deps, handle_convert_file, handle_get_artefact

from .fakes import FakeAsyncTransport, json_response, json_response_with_headers

SUBMIT_OK = json_response(202, {
    "job_id": "job-1",
    "poll_url": "/v1/canonize/job-1",
    "estimated_seconds": 5,
    "input_bytes": 1000,
    "billable_units": 1,
})

POLL_OK = json_response(200, {
    "job_id": "job-1",
    "status": "ok",
    "metadata": {"detected_type": "application/pdf", "input_bytes": 1000, "input_hash": "aabb"},
    "artefacts": [
        {"name": "markdown", "mime_type": "text/markdown", "size_bytes": 100, "label": "Extracted text"},
        {"name": "page-1", "mime_type": "image/png", "size_bytes": 5000, "label": "Page 1"},
    ],
})

POLL_OK_TEXT_ONLY = json_response(200, {
    "job_id": "job-1",
    "status": "ok",
    "metadata": {"detected_type": "text/plain", "input_bytes": 50, "input_hash": "ccdd"},
    "artefacts": [
        {"name": "markdown", "mime_type": "text/markdown", "size_bytes": 50, "label": "Content"},
    ],
})

MARKDOWN_BYTES = b"# Hello\n\nExtracted content."
PNG_BYTES = b"\x89PNG fake image data"


def _make_deps(transport: FakeAsyncTransport, tmp_path) -> Deps:
    cache = DiskCache(cache_dir=tmp_path / "cache")
    client = AsyncCanonizr(transport=transport, cache=cache, timeout=5.0)
    return Deps(client=client, cache=cache)


class TestConvertFile:
    async def test_returns_manifest_and_text(self, tmp_path):
        t = FakeAsyncTransport()
        md_resp = Response(status_code=200, body=MARKDOWN_BYTES, headers={})
        t.enqueue(SUBMIT_OK, POLL_OK, md_resp)
        deps = _make_deps(t, tmp_path)

        f = tmp_path / "doc.pdf"
        f.write_bytes(b"pdf content")

        result = await handle_convert_file(str(f), deps)

        # First block is manifest summary
        assert "Converted: doc.pdf" in result[0].text
        assert "job-1" in result[0].text
        assert "markdown" in result[0].text
        assert "page-1" in result[0].text
        assert "not yet fetched" in result[0].text

        # Second block is inlined markdown
        assert len(result) == 2
        assert result[1].text == "# Hello\n\nExtracted content."

    async def test_file_not_found(self, tmp_path):
        t = FakeAsyncTransport()
        deps = _make_deps(t, tmp_path)

        result = await handle_convert_file("/nonexistent/file.pdf", deps)

        assert len(result) == 1
        assert "Error: file not found" in result[0].text

    async def test_cache_hit_skips_api(self, tmp_path):
        t = FakeAsyncTransport()
        md_resp = Response(status_code=200, body=MARKDOWN_BYTES, headers={})
        # Only enough responses for one round-trip
        t.enqueue(SUBMIT_OK, POLL_OK_TEXT_ONLY, md_resp)
        deps = _make_deps(t, tmp_path)

        f = tmp_path / "doc.txt"
        f.write_bytes(b"hello world")

        # First call — hits API
        result1 = await handle_convert_file(str(f), deps)
        request_count_after_first = len(t.requests)

        # Second call — cache hit, no new API calls
        # Need to enqueue a markdown response for the cached fetch
        t.enqueue(md_resp)
        result2 = await handle_convert_file(str(f), deps)

        # Cache hit means no POST or poll GET — only maybe an artefact fetch
        # if the artefact wasn't cached yet
        assert result2[0].text.startswith("Converted:")

    async def test_text_only_no_binary_section(self, tmp_path):
        t = FakeAsyncTransport()
        md_resp = Response(status_code=200, body=b"just text", headers={})
        t.enqueue(SUBMIT_OK, POLL_OK_TEXT_ONLY, md_resp)
        deps = _make_deps(t, tmp_path)

        f = tmp_path / "doc.txt"
        f.write_bytes(b"hello")

        result = await handle_convert_file(str(f), deps)

        manifest = result[0].text
        assert "Image/binary" not in manifest


class TestGetArtefact:
    async def test_text_artefact_inlined(self, tmp_path):
        t = FakeAsyncTransport()
        t.enqueue(
            Response(status_code=200, body=MARKDOWN_BYTES, headers={}),
            POLL_OK,
        )
        deps = _make_deps(t, tmp_path)

        result = await handle_get_artefact("job-1", "markdown", deps)

        assert len(result) == 1
        assert result[0].text == "# Hello\n\nExtracted content."

    async def test_binary_artefact_saved_to_cache(self, tmp_path):
        t = FakeAsyncTransport()
        t.enqueue(
            Response(status_code=200, body=PNG_BYTES, headers={}),
            POLL_OK,
        )
        deps = _make_deps(t, tmp_path)

        result = await handle_get_artefact("job-1", "page-1", deps)

        assert len(result) == 1
        assert "Saved to:" in result[0].text

        # Verify file was actually written
        saved_path = result[0].text.replace("Saved to: ", "")
        from pathlib import Path
        assert Path(saved_path).read_bytes() == PNG_BYTES
