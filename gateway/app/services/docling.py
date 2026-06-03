import asyncio
import logging
import os
import time
from io import BytesIO

import httpx

from ..pdfsplit import split as split_pdf
from ..tracing import Span
from .retry import request_with_retry

logger = logging.getLogger(__name__)

URL = os.environ.get("DOCLING_ENDPOINT") or "http://docling:5001/v1/convert/file"
CHUNK_PAGES = int(os.environ.get("DOCLING_CHUNK_PAGES", "10"))
CHUNK_CONCURRENCY = int(os.environ.get("DOCLING_CHUNK_CONCURRENCY", "2"))


async def _convert_single(file_bytes: bytes, mime_type: str, deadline: float, parent: Span) -> tuple[str, list[dict]]:
    """Send a single PDF (or chunk) to Docling. Returns (markdown, pictures)."""
    content = BytesIO(file_bytes)

    http_span = Span(name="http_request", attributes={"input_size_bytes": len(file_bytes)})
    http_span._start = time.monotonic()
    parent.children.append(http_span)

    async with httpx.AsyncClient() as client:
        response = await request_with_retry(
            client,
            "POST",
            URL,
            deadline=deadline,
            service_name="docling",
            span=http_span,
            files=[("files", ("document.pdf", content, mime_type))],
            data={
                "to_formats": ["md", "json"],
                "image_export_mode": "embedded",
                "do_ocr": False,
            },
        )

    http_span._end = time.monotonic()

    raw = response.json()
    md_content = raw.get("document", {}).get("md_content", "")
    json_content = raw.get("document", {}).get("json_content", {})
    pictures = json_content.get("pictures", [])
    return md_content, pictures


def merge_chunks(results: list[tuple[int, str, list[dict]]]) -> tuple[str, list[dict]]:
    """Merge indexed chunk results into a single (markdown, pictures) pair."""
    results.sort(key=lambda r: r[0])
    md = "\n\n".join(r[1] for r in results)
    pictures = []
    for r in results:
        pictures.extend(r[2])
    return md, pictures


async def extract(file_bytes: bytes, mime_type: str, deadline: float, parent: Span) -> tuple[str, list[dict]]:
    """Extract PDF to (markdown, pictures). No captioning — pure extraction."""
    chunks = split_pdf(file_bytes, CHUNK_PAGES)

    if len(chunks) == 1:
        md_content, pictures = await _convert_single(file_bytes, mime_type, deadline, parent)
    else:
        logger.info("Splitting PDF into %d chunks of up to %d pages", len(chunks), CHUNK_PAGES)
        parent.set(chunks=len(chunks), pages_per_chunk=CHUNK_PAGES)

        sem = asyncio.Semaphore(CHUNK_CONCURRENCY)

        async def _limited(i: int, chunk: bytes) -> tuple[int, str, list[dict]]:
            async with sem:
                chunk_span = Span(name=f"chunk[{i}]", attributes={"chunk_index": i})
                parent.children.append(chunk_span)
                md, pics = await _convert_single(chunk, mime_type, deadline, chunk_span)
                return i, md, pics

        tasks = [_limited(i, chunk) for i, chunk in enumerate(chunks)]
        results = await asyncio.gather(*tasks)
        md_content, pictures = merge_chunks(list(results))

    parent.set(md_length=len(md_content), pictures_count=len(pictures))
    return md_content, pictures


class HttpPdfExtractor:
    """PdfExtractor implementation backed by a Docling HTTP service."""

    async def convert(self, file_bytes: bytes, mime_type: str, deadline: float, parent: Span) -> tuple[str, list[dict]]:
        return await extract(file_bytes, mime_type, deadline, parent)
