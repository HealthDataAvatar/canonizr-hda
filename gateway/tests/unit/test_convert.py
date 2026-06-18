"""Unit test for the canonize router — multi-page images must keep every page."""

from io import BytesIO
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from PIL import Image

from app.artefacts import ArtefactStore
from app.convert import _extract_pdf, canonize
from app.tracing import Span, Trace
from app.types import Markdown, PdfContent, PdfText, SubmittedFile
from tests.fakes import (
    FakeBlobStore,
    FakeImageExtractor,
    FakePageRenderer,
    FakePdfTextExtractor,
    FakeTableExtractor,
)


def _multipage_tiff(colors) -> bytes:
    frames = [Image.new("RGB", (50, 50), c) for c in colors]
    buf = BytesIO()
    frames[0].save(buf, format="TIFF", save_all=True, append_images=frames[1:])
    return buf.getvalue()


@pytest.mark.asyncio
async def test_multipage_tiff_stores_every_page():
    # No silent data loss: a 3-page TIFF must yield 3 image artefacts.
    artefacts = ArtefactStore("u1/j1", b"\x00" * 32, FakeBlobStore())
    file = SubmittedFile(data=_multipage_tiff(["red", "green", "blue"]), mime_type="image/tiff", filename="scan.tiff")

    md = await canonize(file, deadline=0.0, trace=Trace("worker"), svc=MagicMock(), artefacts=artefacts)

    assert md == ""
    images = [a for a in artefacts.manifest if a.name.startswith("image-")]
    assert {a.name for a in images} == {"image-1", "image-2", "image-3"}
    assert all(a.mime_type == "image/png" for a in images)


@pytest.mark.asyncio
async def test_single_image_stores_one_page():
    artefacts = ArtefactStore("u1/j1", b"\x00" * 32, FakeBlobStore())
    buf = BytesIO()
    Image.new("RGB", (50, 50), "red").save(buf, format="PNG")
    file = SubmittedFile(data=buf.getvalue(), mime_type="image/png", filename="one.png")

    await canonize(file, deadline=0.0, trace=Trace("worker"), svc=MagicMock(), artefacts=artefacts)

    images = [a for a in artefacts.manifest if a.name.startswith("image-")]
    assert [a.name for a in images] == ["image-1"]


@pytest.mark.asyncio
async def test_pdf_stores_text_layout_artefact():
    # The positional text layout must be persisted as a JSON artefact so
    # downstream can locate text on a page (and fall back to the render).
    blobs = FakeBlobStore()
    artefacts = ArtefactStore("u1/j1", b"\x00" * 32, blobs)
    pages = [{"page_num": 1, "width": 612.0, "height": 792.0, "items": [{"text": "hi", "x": 1.0}]}]
    svc = SimpleNamespace(
        pdf_text_extractor=FakePdfTextExtractor([PdfText(markdown=Markdown("hi"), pages=pages)]),
        page_renderer=FakePageRenderer(page_count=1),
        pdf_image_extractor=FakeImageExtractor(),
        pdf_table_extractor=FakeTableExtractor(),
    )

    pdf = PdfContent(data=b"%PDF-fake", source_mime="application/pdf")
    await _extract_pdf(pdf, Span("t"), svc, artefacts)  # type: ignore[arg-type]

    layout = [a for a in artefacts.manifest if a.name == "text-layout"]
    assert len(layout) == 1
    assert layout[0].mime_type == "application/json"
