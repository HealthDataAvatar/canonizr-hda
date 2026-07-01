"""Unit tests for MarkItDownExtractor (launch stopgap: deadline via wait_for).

Real isolation is the parse sidecar (docs/issues/untrusted-parse-isolation.md);
these cover the interim deadline behaviour only.
"""

import time

import pytest

from app.errors import MalformedInput
from app.services.markitdown import MarkItDownExtractor
from app.types import OoxmlDocument


def _doc(data: bytes, filename: str) -> OoxmlDocument:
    return OoxmlDocument(data=data, mime_type="text/html", filename=filename)


class TestMarkItDownDeadline:
    @pytest.mark.asyncio
    async def test_real_parse_round_trips(self):
        html = b"<html><body><h1>Hello</h1><p>world</p></body></html>"
        out = await MarkItDownExtractor().extract(_doc(html, "x.html"), deadline=time.monotonic() + 30)
        assert "Hello" in out and "world" in out

    @pytest.mark.asyncio
    async def test_expired_deadline_fails_fast(self):
        with pytest.raises(MalformedInput, match="Deadline exceeded"):
            await MarkItDownExtractor().extract(_doc(b"<p>x</p>", "x.html"), deadline=time.monotonic() - 1)

    @pytest.mark.asyncio
    async def test_slow_parse_times_out(self, monkeypatch):
        # A parse that outruns the deadline surfaces as MalformedInput, not a hang.
        ext = MarkItDownExtractor()

        def _slow(*args, **kwargs):
            time.sleep(5)

        monkeypatch.setattr(ext._mit, "convert_stream", _slow)
        start = time.monotonic()
        with pytest.raises(MalformedInput, match="processing budget"):
            await ext.extract(_doc(b"<p>x</p>", "x.html"), deadline=time.monotonic() + 1)
        assert time.monotonic() - start < 3  # returned near the 1s deadline
