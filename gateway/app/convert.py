"""Canonize pipeline — reduce files to canonical machine-readable forms.

Each step is a standalone function with typed inputs and outputs.
The router composes steps and stores artefacts at the seams.
No AI interpretation — that belongs in the describe pipeline.
"""

from __future__ import annotations

import logging
import re

from .artefacts import ArtefactStore
from .context import Services
from .errors import ServiceNotConfigured, UnsupportedFormat
from .imageconv import to_vlm_png
from .mimetypes import LIBREOFFICE_TYPES, MARKITDOWN_TYPES, PASSTHROUGH_TYPES
from .protocols import OleConverter, OoxmlExtractor, PageRenderer, PdfExtractor
from .tracing import Service, Span, Trace
from .types import (
    ExtractedDocument,
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


async def extract_pdf(pdf: PdfContent, deadline: float, span: Span, extractor: PdfExtractor) -> ExtractedDocument:
    """PDF → structured document with text and classified images."""
    with span.span(Service.DOCLING) as docling_span:
        return await extractor.extract(pdf, deadline, docling_span)


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


# Base64 image references inlined by Docling
_IMAGE_RE = re.compile(r"!\[([^\]]*)\]\(data:(image/[^;]+);base64,([^)]+)\)")


# ---------------------------------------------------------------------------
# Router — composes steps, stores artefacts at the seams
# ---------------------------------------------------------------------------


def _strip_base64_images(markdown: Markdown) -> Markdown:
    """Remove base64-inlined images from Docling markdown output.

    Images are already stored as separate artefacts; the inline base64
    references are redundant and bloat the markdown.
    """
    return Markdown(_IMAGE_RE.sub("", markdown).strip())


async def canonize(
    file: SubmittedFile,
    deadline: float,
    trace: Trace,
    svc: Services,
    artefacts: ArtefactStore | None = None,
) -> Markdown:
    """Reduce a file to its canonical machine-readable forms.

    Artefacts (thumbnails, converted PDF, extracted images, normalised PNGs)
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
        doc_ext = await extract_pdf(pdf, deadline, parent, svc.pdf_extractor)

        # Store artefacts: thumbnails + extracted images
        if artefacts:
            await _store_pdf_artefacts(pdf, doc_ext, artefacts, parent, svc.page_renderer)

        # Strip base64 image references — images are in artefacts
        return _strip_base64_images(doc_ext.markdown)

    raise UnsupportedFormat(mime)


# Keep old name as alias during migration
convert = canonize


# ---------------------------------------------------------------------------
# Artefact helpers
# ---------------------------------------------------------------------------


async def _store_pdf_artefacts(
    pdf: PdfContent,
    doc: ExtractedDocument,
    artefacts: ArtefactStore,
    span: Span,
    renderer: PageRenderer,
) -> None:
    """Store page thumbnails and extracted images as artefacts."""
    with span.span(Service.ARTEFACTS) as art_span:
        with art_span.span(Service.THUMBNAILS) as thumb_span:
            try:
                pages = await render_thumbnails(pdf, renderer)
                for png in pages:
                    name = artefacts.allocate("page")
                    await artefacts.put(name, png, "image/png", label=f"Page {int(name.split('-')[1]) + 1}")
                thumb_span.set(page_count=len(pages))
            except Exception:
                logger.warning("Failed to render page thumbnails", exc_info=True)
                thumb_span.set(error="render failed")

        image_count = 0
        for img in doc.images:
            name = artefacts.allocate("image")
            await artefacts.put(name, img.data, img.mime_type, label=img.label)
            image_count += 1

        art_span.set(
            artefact_count=len(artefacts.manifest),
            image_count=image_count,
            total_bytes=sum(a.size_bytes for a in artefacts.manifest),
        )
