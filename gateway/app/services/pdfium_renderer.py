"""PDF page rendering using pypdfium2.

Implements the PageRenderer protocol. Replaces PyMuPDF (AGPL) with pypdfium2 (Apache-2.0).
"""

import asyncio
import functools
from io import BytesIO

from ..types import PageRenders, PdfContent

PREVIEW_MAX_WIDTH = 200


def _render_pages_sync(pdf_bytes: bytes, dpi: int) -> tuple[list[bytes], list[bytes], list[str]]:
    import pypdfium2 as pdfium
    from PIL import Image

    pdf = pdfium.PdfDocument(pdf_bytes)
    scale = dpi / 72
    pages: list[bytes] = []
    previews: list[bytes] = []
    page_labels: list[str] = []
    try:
        for i in range(len(pdf)):
            page = pdf[i]
            bitmap = page.render(scale=scale)  # type: ignore[arg-type]  # pypdfium2 accepts float despite stub
            pil_image = bitmap.to_pil()

            # Full-size PNG
            buf = BytesIO()
            pil_image.save(buf, format="PNG")
            pages.append(buf.getvalue())

            # Tiny WebP preview
            ratio = PREVIEW_MAX_WIDTH / pil_image.width
            preview = pil_image.resize(
                (PREVIEW_MAX_WIDTH, int(pil_image.height * ratio)),
                Image.Resampling.LANCZOS,
            )
            buf = BytesIO()
            preview.save(buf, format="WEBP", quality=60)
            previews.append(buf.getvalue())

            # Document-defined page label
            try:
                lbl = pdf.get_page_label(i)
                page_labels.append(lbl.replace("\n", " ").strip() if lbl else str(i + 1))
            except Exception:
                page_labels.append(str(i + 1))
    finally:
        pdf.close()
    return pages, previews, page_labels


class PdfiumPageRenderer:
    """PageRenderer implementation using pypdfium2."""

    async def render(self, pdf: PdfContent, dpi: int = 150) -> PageRenders:
        loop = asyncio.get_running_loop()
        pages, previews, page_labels = await loop.run_in_executor(
            None, functools.partial(_render_pages_sync, pdf.data, dpi)
        )
        return PageRenders(pages=pages, previews=previews, page_labels=page_labels)
