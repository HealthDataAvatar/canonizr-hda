"""PDF text extraction using LiteParse.

Implements the PdfTextExtractor protocol.
"""

import asyncio
import functools
import os
import tempfile

from ..tracing import Span
from ..types import Markdown, PdfContent, PdfText


def _extract_sync(pdf_bytes: bytes) -> PdfText:
    from liteparse import LiteParse

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
        f.write(pdf_bytes)
        tmp_path = f.name
    try:
        lp = LiteParse()
        result = lp.parse(tmp_path)
        pages = [
            {
                "page_num": p.page_num,
                "width": p.width,
                "height": p.height,
                "items": [
                    {
                        "text": it.text,
                        "x": it.x,
                        "y": it.y,
                        "width": it.width,
                        "height": it.height,
                        "font_name": it.font_name,
                        "font_size": it.font_size,
                        "confidence": it.confidence,
                    }
                    for it in p.text_items
                ],
            }
            for p in result.pages
        ]
        return PdfText(markdown=Markdown(result.text), pages=pages)
    finally:
        os.unlink(tmp_path)


class LiteParsePdfTextExtractor:
    """PdfTextExtractor implementation using LiteParse."""

    async def extract(self, pdf: PdfContent, span: Span) -> PdfText:
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, functools.partial(_extract_sync, pdf.data))
        span.set(md_length=len(result.markdown))
        return result
