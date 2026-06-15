"""Embedded image extraction using pikepdf.

Implements the ImageExtractor protocol. Lossless extraction where possible.
"""

import asyncio
import functools
from io import BytesIO

from ..tracing import Span
from ..types import EmbeddedImage, PdfContent

MIN_DIMENSION = 50  # skip decorative images smaller than 50x50


def _extract_images_sync(pdf_bytes: bytes) -> list[EmbeddedImage]:
    import pikepdf

    pdf = pikepdf.open(BytesIO(pdf_bytes))
    images: list[EmbeddedImage] = []
    try:
        for page_num, page in enumerate(pdf.pages):
            for _name, raw in page.images.items():
                pdfimage = pikepdf.PdfImage(raw)

                # Skip small decorative images
                if pdfimage.width < MIN_DIMENSION or pdfimage.height < MIN_DIMENSION:
                    continue

                pil_img = pdfimage.as_pil_image()
                buf = BytesIO()
                fmt = "PNG" if pil_img.mode in ("RGBA", "LA", "PA") else "JPEG"
                mime = f"image/{'png' if fmt == 'PNG' else 'jpeg'}"
                pil_img.save(buf, format=fmt)
                images.append(
                    EmbeddedImage(
                        data=buf.getvalue(),
                        mime_type=mime,
                        page=page_num,
                    )
                )
    finally:
        pdf.close()
    return images


class PikepdfImageExtractor:
    """ImageExtractor implementation using pikepdf."""

    async def extract(self, pdf: PdfContent, span: Span) -> list[EmbeddedImage]:
        loop = asyncio.get_running_loop()
        images = await loop.run_in_executor(None, functools.partial(_extract_images_sync, pdf.data))
        span.set(image_count=len(images))
        return images
