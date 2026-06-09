"""Canonize pipeline — reduce files to canonical machine-readable forms.

Each step is a standalone function with typed inputs and outputs.
The router composes steps and stores artefacts at the seams.
No AI interpretation — that belongs in the describe pipeline.
"""

from __future__ import annotations

import asyncio
import logging

from .artefacts import ArtefactStore
from .context import Services
from .errors import ServiceNotConfigured, UnsupportedFormat
from .imageconv import to_vlm_png
from .mimetypes import LIBREOFFICE_TYPES, MARKITDOWN_TYPES, PASSTHROUGH_TYPES
from .protocols import OleConverter, OoxmlExtractor, PageRenderer
from .tracing import Service, Span, Trace
from .types import (
    ExtractedTables,
    ImageFile,
    Markdown,
    OleOfficeDocument,
    OoxmlDocument,
    PdfContent,
    SubmittedFile,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Step functions — typed input, typed output, single service dependency
# ---------------------------------------------------------------------------


async def to_pdf(doc: OleOfficeDocument, deadline: float, span: Span, converter: OleConverter) -> PdfContent:
    """Pre-2007 binary office → PDF via Gotenberg."""
    if not converter.is_available():
        raise ServiceNotConfigured(f"This file type ({doc.mime_type}) requires LibreOffice. Rerun setup to enable it.")
    with span.span(Service.GOTENBERG) as lo_span:
        return await converter.convert(doc, deadline, lo_span)


async def extract_ooxml(doc: OoxmlDocument, span: Span, extractor: OoxmlExtractor) -> Markdown:
    """Modern office/HTML → markdown via MarkItDown."""
    with span.span(Service.MARKITDOWN) as md_span:
        result = await extractor.extract(doc)
        md_span.set(md_length=len(result))
    return result


def extract_text(file: SubmittedFile) -> Markdown:
    """Passthrough — decode UTF-8."""
    return Markdown(file.data.decode("utf-8", errors="replace"))


async def render_thumbnails(pdf: PdfContent, renderer: PageRenderer) -> list[bytes]:
    """PDF → list of PNG page thumbnails."""
    result = await renderer.render(pdf)
    return result.pages


# ---------------------------------------------------------------------------
# Table inlining — pure function
# ---------------------------------------------------------------------------


def _inline_tables(text: Markdown, tables: ExtractedTables) -> Markdown:
    """Append extracted tables as markdown, grouped by source page."""
    if not tables.tables:
        return text
    parts: list[str] = [text]
    for tbl in sorted(tables.tables, key=lambda t: t.page):
        md = tbl.to_markdown()
        if md:
            parts.append(f"\n\n<!-- Table from page {tbl.page + 1} -->\n{md}")
    return Markdown("\n".join(parts))


# ---------------------------------------------------------------------------
# Router — composes steps, stores artefacts at the seams
# ---------------------------------------------------------------------------


async def _extract_pdf_parallel(
    pdf: PdfContent,
    span: Span,
    svc: Services,
    artefacts: ArtefactStore | None,
) -> Markdown:
    """Run all four PDF extractions in parallel, store artefacts, return markdown."""

    async def _text():
        with span.span(Service.LITEPARSE) as s:
            return await svc.pdf_text_extractor.extract(pdf, s)

    async def _pages():
        with span.span(Service.THUMBNAILS) as s:
            try:
                result = await render_thumbnails(pdf, svc.page_renderer)
                s.set(page_count=len(result))
                return result
            except Exception:
                logger.warning("Thumbnail render failed", exc_info=True)
                s.set(error="render failed")
                return []

    async def _images():
        with span.span(Service.PIKEPDF) as s:
            return await svc.pdf_image_extractor.extract(pdf, s)

    async def _tables():
        with span.span(Service.CAMELOT) as s:
            return await svc.pdf_table_extractor.extract(pdf, s)

    text, pages, images, tables = await asyncio.gather(_text(), _pages(), _images(), _tables())

    # Inline tables into the markdown
    text = _inline_tables(text, tables)

    # Store artefacts
    if artefacts:
        with span.span(Service.ARTEFACTS) as art_span:
            for png in pages:
                name = artefacts.allocate("page")
                await artefacts.put(name, png, "image/png", label=f"Page {int(name.split('-')[1]) + 1}")
            for img in images:
                name = artefacts.allocate("image")
                await artefacts.put(name, img.data, img.mime_type, label=img.label)
            for tbl in tables.tables:
                name = artefacts.allocate("table")
                await artefacts.put(
                    name, tbl.to_json().encode(), "application/json", label=f"Table from page {tbl.page + 1}"
                )
            art_span.set(
                artefact_count=len(artefacts.manifest),
                image_count=len(images),
                table_count=len(tables.tables),
                total_bytes=sum(a.size_bytes for a in artefacts.manifest),
            )

    return text


async def canonize(
    file: SubmittedFile,
    deadline: float,
    trace: Trace,
    svc: Services,
    artefacts: ArtefactStore | None = None,
) -> Markdown:
    """Reduce a file to its canonical machine-readable forms.

    Artefacts (thumbnails, converted PDF, extracted images, tables)
    are stored via the ArtefactStore. The return value is the extracted
    markdown text (empty string for image-only inputs).
    """
    parent = trace.root
    mime = file.mime_type

    # Text passthrough
    if mime in PASSTHROUGH_TYPES:
        with parent.span(Service.PASSTHROUGH):
            pass
        return extract_text(file)

    # Standalone images → normalise to PNG
    if mime.startswith("image/"):
        image = ImageFile(data=file.data, mime_type=mime)
        with parent.span(Service.NORMALISE_IMAGE) as img_span:
            png = to_vlm_png(image)
            img_span.set(input_mime=mime, output_bytes=len(png.data))
        if artefacts:
            await artefacts.put("image-0", png.data, "image/png", label="Normalised image")
        return Markdown("")

    # Modern office formats (OOXML, HTML, epub, email)
    if mime in MARKITDOWN_TYPES:
        doc = OoxmlDocument(data=file.data, mime_type=mime, filename=file.filename)
        return await extract_ooxml(doc, parent, svc.ooxml_extractor)

    # Legacy office → PDF, or direct PDF
    pdf: PdfContent | None = None

    if mime in LIBREOFFICE_TYPES:
        ole_doc = OleOfficeDocument(data=file.data, mime_type=mime, filename=file.filename)
        pdf = await to_pdf(ole_doc, deadline, parent, svc.ole_converter)
        if artefacts:
            await artefacts.put("pdf", pdf.data, "application/pdf", label="Converted PDF")

    elif mime == "application/pdf":
        pdf = PdfContent(data=file.data, source_mime=mime)

    if pdf:
        return await _extract_pdf_parallel(pdf, parent, svc, artefacts)

    raise UnsupportedFormat(mime)


# Keep old name as alias during migration
convert = canonize
