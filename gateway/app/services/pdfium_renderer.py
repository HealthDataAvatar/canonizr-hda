"""PDF page rendering using pypdfium2.

Implements the PageRenderer protocol. Replaces PyMuPDF (AGPL) with pypdfium2 (Apache-2.0).
"""

import asyncio
import functools
from io import BytesIO

from ..types import PageThumbnailPNGs, PdfContent


def _render_pages_sync(pdf_bytes: bytes, dpi: int) -> list[bytes]:
    import pypdfium2 as pdfium

    pdf = pdfium.PdfDocument(pdf_bytes)
    scale = dpi / 72
    pages: list[bytes] = []
    try:
        for i in range(len(pdf)):
            page = pdf[i]
            bitmap = page.render(scale=scale)  # type: ignore[arg-type]  # pypdfium2 accepts float despite stub
            pil_image = bitmap.to_pil()
            buf = BytesIO()
            pil_image.save(buf, format="PNG")
            pages.append(buf.getvalue())
    finally:
        pdf.close()
    return pages


class PdfiumPageRenderer:
    """PageRenderer implementation using pypdfium2."""

    async def render(self, pdf: PdfContent, dpi: int = 150) -> PageThumbnailPNGs:
        loop = asyncio.get_running_loop()
        pages = await loop.run_in_executor(None, functools.partial(_render_pages_sync, pdf.data, dpi))
        return PageThumbnailPNGs(pages=pages)
