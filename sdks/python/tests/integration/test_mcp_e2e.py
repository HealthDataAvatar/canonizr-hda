"""End-to-end tests for MCP server handlers against a real gateway stack.

Tests handle_convert_file and handle_get_artefact with a real
AsyncCanonizr client pointing at the Docker gateway.

Requires: docker compose -f docker-compose.sdk-test.yml up
"""

from __future__ import annotations

import pytest

from canonizr.cache import DiskCache
from canonizr.client import AsyncCanonizr
from canonizr.mcp_server import Deps, handle_convert_file, handle_get_artefact

from .conftest import GATEWAY_URL, SeedCredentials

pytestmark = pytest.mark.integration


class TestMcpConvertFile:
    async def test_convert_text_file(self, credentials: SeedCredentials, tmp_path):
        cache = DiskCache(cache_dir=tmp_path / "cache")
        async with AsyncCanonizr(credentials.api_key, base_url=GATEWAY_URL, cache=cache) as client:
            deps = Deps(client=client, cache=cache)

            f = tmp_path / "doc.txt"
            f.write_text("MCP integration test content")

            result = await handle_convert_file(str(f), deps)

        # First block is manifest summary
        assert "Converted: doc.txt" in result[0].text
        assert "Job ID:" in result[0].text

        # Should have inlined text content
        assert len(result) >= 2
        assert "MCP integration test content" in result[1].text or len(result[1].text) > 0

    async def test_convert_missing_file(self, credentials: SeedCredentials, tmp_path):
        cache = DiskCache(cache_dir=tmp_path / "cache")
        async with AsyncCanonizr(credentials.api_key, base_url=GATEWAY_URL, cache=cache) as client:
            deps = Deps(client=client, cache=cache)

            result = await handle_convert_file("/nonexistent/file.pdf", deps)

        assert "Error: file not found" in result[0].text

    async def test_cache_hit_on_second_convert(self, credentials: SeedCredentials, tmp_path):
        cache = DiskCache(cache_dir=tmp_path / "cache")
        async with AsyncCanonizr(credentials.api_key, base_url=GATEWAY_URL, cache=cache) as client:
            deps = Deps(client=client, cache=cache)

            f = tmp_path / "doc.txt"
            f.write_text("MCP cache test")

            result1 = await handle_convert_file(str(f), deps)
            result2 = await handle_convert_file(str(f), deps)

        # Both should have the same job ID (cache hit)
        assert "Job ID:" in result1[0].text
        assert "Job ID:" in result2[0].text
        # Extract job IDs
        job_id_1 = [line for line in result1[0].text.split("\n") if "Job ID:" in line][0]
        job_id_2 = [line for line in result2[0].text.split("\n") if "Job ID:" in line][0]
        assert job_id_1 == job_id_2


class TestMcpGetArtefact:
    async def test_fetch_text_artefact(self, credentials: SeedCredentials, tmp_path):
        cache = DiskCache(cache_dir=tmp_path / "cache")
        async with AsyncCanonizr(credentials.api_key, base_url=GATEWAY_URL, cache=cache) as client:
            deps = Deps(client=client, cache=cache)

            f = tmp_path / "doc.txt"
            f.write_text("Artefact fetch test")

            convert_result = await handle_convert_file(str(f), deps)
            # Extract job ID
            job_id_line = [line for line in convert_result[0].text.split("\n") if "Job ID:" in line][0]
            job_id = job_id_line.split("Job ID: ")[1].strip()

            artefact_result = await handle_get_artefact(job_id, "markdown", deps)

        assert len(artefact_result) == 1
        assert len(artefact_result[0].text) > 0
