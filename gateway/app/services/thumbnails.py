"""PDF page thumbnail rendering using PyMuPDF (fitz).

Implements the PageRenderer protocol.
"""

import asyncio
import functools

import fitz  # pymupdf

from ..types import PageThumbnailPNGs, PdfContent


def _render_pages_sync(pdf_bytes: bytes, dpi: int) -> list[bytes]:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    pages = []
    try:
        for page in doc:
            pixmap = page.get_pixmap(dpi=dpi)
            pages.append(pixmap.tobytes("png"))
    finally:
        doc.close()
    return pages


class PyMuPdfRenderer:
    """PageRenderer implementation using PyMuPDF."""

    async def render(self, pdf: PdfContent, dpi: int = 150) -> PageThumbnailPNGs:
        loop = asyncio.get_running_loop()
        pages = await loop.run_in_executor(None, functools.partial(_render_pages_sync, pdf.data, dpi))
        return PageThumbnailPNGs(pages=pages)
