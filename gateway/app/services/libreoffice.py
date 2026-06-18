"""LibreOffice conversion via Gotenberg.

Gotenberg's LibreOffice endpoint converts legacy formats to PDF.
The PDF is then re-dispatched to Docling for markdown extraction.

API: POST /forms/libreoffice/convert
Form field: files (multipart file upload)
Response: PDF bytes
"""

import os
from io import BytesIO

import httpx

from ..tracing import Span
from ..types import OleOfficeDocument, PdfContent
from .retry import request_with_retry

GOTENBERG_URL = os.environ.get("GOTENBERG_URL", "http://gotenberg:3000")
CONVERT_PATH = "/forms/libreoffice/convert"


class GotenbergOleConverter:
    """OleConverter implementation backed by Gotenberg's LibreOffice endpoint."""

    def is_available(self) -> bool:
        return os.environ.get("LIBREOFFICE_ENABLED", "false").lower() == "true"

    async def convert(self, doc: OleOfficeDocument, deadline: float, span: Span) -> PdfContent:
        """Convert a legacy document to PDF via Gotenberg."""
        url = f"{GOTENBERG_URL}{CONVERT_PATH}"
        with span.span("http_request", input_size_bytes=len(doc.data)) as http_span:
            async with httpx.AsyncClient() as client:
                response = await request_with_retry(
                    client,
                    "POST",
                    url,
                    deadline=deadline,
                    service_name="gotenberg",
                    span=http_span,
                    files=[("files", (doc.filename, BytesIO(doc.data), doc.mime_type))],
                )
        return PdfContent(data=response.content, source_mime=doc.mime_type)
