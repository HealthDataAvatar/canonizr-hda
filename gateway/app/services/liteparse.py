"""PDF text extraction using LiteParse.

Implements the PdfTextExtractor protocol.
"""

import asyncio
import functools
import os
import tempfile

from ..tracing import Span
from ..types import Markdown, PdfContent


def _extract_sync(pdf_bytes: bytes) -> str:
    from liteparse import LiteParse

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
        f.write(pdf_bytes)
        tmp_path = f.name
    try:
        lp = LiteParse()
        result = lp.parse(tmp_path)
        return result.text
    finally:
        os.unlink(tmp_path)


class LiteParsePdfTextExtractor:
    """PdfTextExtractor implementation using LiteParse."""

    async def extract(self, pdf: PdfContent, span: Span) -> Markdown:
        loop = asyncio.get_running_loop()
        text = await loop.run_in_executor(None, functools.partial(_extract_sync, pdf.data))
        span.set(md_length=len(text))
        return Markdown(text)
