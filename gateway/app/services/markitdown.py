"""MarkItDown office/HTML extraction — async wrapper around synchronous library."""

import asyncio
import functools
from io import BytesIO

from markitdown import MarkItDown

from ..types import Markdown, OoxmlDocument


def _ext_from_filename(filename: str) -> str:
    if "." in filename:
        return "." + filename.rsplit(".", 1)[-1].lower()
    return ""


class MarkItDownExtractor:
    """OoxmlExtractor implementation. Wraps MarkItDown in a thread executor."""

    def __init__(self) -> None:
        self._mit = MarkItDown()

    async def extract(self, doc: OoxmlDocument) -> Markdown:
        ext = _ext_from_filename(doc.filename)
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            None, functools.partial(self._mit.convert_stream, BytesIO(doc.data), file_extension=ext)
        )
        return Markdown(result.text_content)
