"""Canonizr MCP server — thin wrapper over the async SDK.

Exposes document conversion as MCP tools. Runs locally via stdio.
Text artefacts returned inline; images saved to cache and returned as file paths.

Tool logic lives in pure async functions (handle_*) that take Deps directly,
making them testable without faking MCP's Context.

Usage:
    CANONIZR_API_KEY=xxx python -m canonizr.mcp_server

Or in Claude Code's MCP config:
    {
        "command": "python",
        "args": ["-m", "canonizr.mcp_server"],
        "env": {"CANONIZR_API_KEY": "xxx"}
    }
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path

from mcp.server.fastmcp import Context, FastMCP
from mcp.types import TextContent

from .cache import DiskCache
from .client import AsyncCanonizr

_TEXT_MIMES = frozenset({
    "text/markdown",
    "text/plain",
    "text/csv",
    "text/html",
    "application/json",
    "application/xml",
})


def _is_text(mime_type: str) -> bool:
    return mime_type in _TEXT_MIMES or mime_type.startswith("text/")


@dataclass
class Deps:
    client: AsyncCanonizr
    cache: DiskCache


# ---------------------------------------------------------------------------
# Pure tool handlers (testable without MCP Context)
# ---------------------------------------------------------------------------


async def handle_convert_file(path: str, deps: Deps) -> list[TextContent]:
    """Convert a local file. Returns manifest summary + inlined text artefacts."""
    file_path = Path(path).expanduser().resolve()
    if not file_path.exists():
        return [TextContent(type="text", text=f"Error: file not found: {path}")]

    result = await deps.client.canonize(file_path)

    lines = [f"Converted: {file_path.name}", f"Job ID: {result.job_id}", "", "Artefacts:"]
    for a in result.artefacts:
        lines.append(f"  - {a.name} ({a.mime_type}, {a.size_bytes} bytes) {a.label}")

    # Auto-fetch and inline text artefacts
    file_hash = deps.cache.file_hash(file_path.read_bytes())
    contents: list[TextContent] = []
    for a in result.artefacts:
        if _is_text(a.mime_type):
            data = await result.get(a.name)
            contents.append(TextContent(type="text", text=data.decode(errors="replace")))

    # List non-text artefacts with cache paths
    non_text = [a for a in result.artefacts if not _is_text(a.mime_type)]
    if non_text:
        lines.append("")
        lines.append("Image/binary artefacts (use get_artefact to fetch):")
        for a in non_text:
            cached_path = deps.cache.artefact_path(file_hash, a.name)
            if cached_path:
                lines.append(f"  - {a.name}: {cached_path}")
            else:
                lines.append(f"  - {a.name}: not yet fetched")

    return [TextContent(type="text", text="\n".join(lines))] + contents


async def handle_get_artefact(job_id: str, name: str, deps: Deps) -> list[TextContent]:
    """Fetch one artefact. Text inlined, binary saved to cache with path returned."""
    data = await deps.client.get_artefact(job_id, name)

    # Determine MIME type from manifest
    status = await deps.client.get_status(job_id)
    artefact_meta = next((a for a in status.artefacts if a.name == name), None)
    mime = artefact_meta.mime_type if artefact_meta else "application/octet-stream"

    if _is_text(mime):
        return [TextContent(type="text", text=data.decode(errors="replace"))]

    # Binary — save to cache and return path
    save_dir = deps.cache._dir / job_id
    save_dir.mkdir(parents=True, exist_ok=True)
    file_path = save_dir / name
    file_path.write_bytes(data)

    return [TextContent(type="text", text=f"Saved to: {file_path}")]


# ---------------------------------------------------------------------------
# MCP wiring
# ---------------------------------------------------------------------------


@asynccontextmanager
async def _lifespan(_server: FastMCP):
    api_key = os.environ.get("CANONIZR_API_KEY", "")
    if not api_key:
        raise RuntimeError("CANONIZR_API_KEY environment variable is required")

    base_url = os.environ.get("CANONIZR_BASE_URL", "https://api.canonizr.com")
    cache_dir = Path(os.environ.get("CANONIZR_CACHE_DIR", str(Path.home() / ".cache" / "canonizr")))
    cache = DiskCache(cache_dir=cache_dir)

    async with AsyncCanonizr(api_key=api_key, base_url=base_url, cache=cache) as client:
        yield Deps(client=client, cache=cache)


mcp = FastMCP(
    "Canonizr",
    instructions=(
        "Convert documents (PDF, Word, Excel, images, etc.) to structured markdown. "
        "Use convert_file to process a local file. Use get_artefact to fetch specific "
        "parts of a converted document (pages, images, tables)."
    ),
    lifespan=_lifespan,
)


def _deps(ctx: Context) -> Deps:
    return ctx.request_context.lifespan_context  # type: ignore[return-value]


@mcp.tool()
async def convert_file(path: str, ctx: Context) -> list[TextContent]:
    """Convert a local file to structured markdown.

    Submits the file to Canonizr, waits for processing, and returns
    the artefact manifest with text content inlined. Use get_artefact
    to fetch images or other binary artefacts.

    Args:
        path: Absolute path to the file to convert.
    """
    return await handle_convert_file(path, _deps(ctx))


@mcp.tool()
async def get_artefact(job_id: str, name: str, ctx: Context) -> list[TextContent]:
    """Fetch a specific artefact from a converted document.

    For text artefacts (markdown, CSV, etc.), returns the content inline.
    For images/binary, downloads to the local cache and returns the file path.

    Args:
        job_id: The job ID from convert_file.
        name: The artefact name (e.g. "markdown", "page-0", "image-2").
    """
    return await handle_get_artefact(job_id, name, _deps(ctx))


def main() -> None:
    """Entry point for `python -m canonizr.mcp_server`."""
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
