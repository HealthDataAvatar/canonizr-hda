"""MarkItDown office/HTML extraction — async wrapper around synchronous library.

⚠ LAUNCH STOPGAP, not the real isolation. MarkItDown parses untrusted OOXML/HTML
in-process. The proper fix is the generic parse sidecar (see
docs/issues/untrusted-parse-isolation.md). Until that ships, this enforces the
job deadline with `asyncio.wait_for` so a slow/malicious doc can't wedge a job
forever.

KNOWN LIMITATION: `run_in_executor` threads cannot be cancelled — on timeout the
coroutine returns (job fails cleanly, worker moves on) but the thread keeps
running until the parse finishes or the container's memory limit recycles it. So
this bounds *job* latency, not *worker CPU*. A single crafted doc can still burn
one core until it completes. This is why the sidecar (killable, network-isolated
process) is the real fix — do not mistake this stopgap for sandboxing.
"""

import asyncio
import functools
import os
import time
from io import BytesIO

from markitdown import MarkItDown

from ..errors import MalformedInput
from ..types import Markdown, OoxmlDocument


class MarkItDownExtractor:
    """OoxmlExtractor implementation. Wraps MarkItDown in a thread executor with
    a deadline (see module docstring for the stopgap caveat)."""

    def __init__(self) -> None:
        self._mit = MarkItDown()

    async def extract(self, doc: OoxmlDocument, deadline: float) -> Markdown:
        ext = os.path.splitext(doc.filename)[1].lower()
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise MalformedInput("Deadline exceeded before MarkItDown could start")

        loop = asyncio.get_running_loop()
        fut = loop.run_in_executor(
            None, functools.partial(self._mit.convert_stream, BytesIO(doc.data), file_extension=ext)
        )
        try:
            result = await asyncio.wait_for(fut, timeout=remaining)
        except TimeoutError as e:
            # Job fails cleanly; the executor thread may keep running (see caveat).
            raise MalformedInput(
                f"MarkItDown exceeded the {remaining:.0f}s processing budget (document too complex or malicious)"
            ) from e
        return Markdown(result.text_content)
