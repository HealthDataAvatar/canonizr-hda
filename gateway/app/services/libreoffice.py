"""LibreOffice conversion via Gotenberg.

Gotenberg's LibreOffice endpoint converts legacy formats to PDF.
The PDF is then re-dispatched to Docling for markdown extraction.

API: POST /forms/libreoffice/convert
Form field: files (multipart file upload)
Response: PDF bytes
"""

import logging
import os
import time
from io import BytesIO

import httpx

from ..tracing import Span
from .retry import request_with_retry

logger = logging.getLogger(__name__)

GOTENBERG_URL = os.environ.get("GOTENBERG_URL", "http://gotenberg:3000")
CONVERT_PATH = "/forms/libreoffice/convert"


def is_available() -> bool:
    return os.environ.get("LIBREOFFICE_ENABLED", "false").lower() == "true"


async def convert(file_bytes: bytes, mime_type: str, filename: str, deadline: float, parent: Span) -> tuple[bytes, str]:
    """Convert a legacy document to PDF via Gotenberg. Returns (pdf_bytes, 'application/pdf')."""
    content = BytesIO(file_bytes)

    http_span = Span(name="http_request", attributes={"input_size_bytes": len(file_bytes)})
    http_span._start = time.monotonic()
    parent.children.append(http_span)

    url = f"{GOTENBERG_URL}{CONVERT_PATH}"

    async with httpx.AsyncClient() as client:
        response = await request_with_retry(
            client,
            "POST",
            url,
            deadline=deadline,
            service_name="gotenberg",
            span=http_span,
            files=[("files", (filename, content, mime_type))],
        )

    http_span._end = time.monotonic()

    return response.content, "application/pdf"
