"""Conversion pipeline — typed steps composed by a router.

Each step is a standalone function with typed inputs and outputs.
The router composes steps and stores artefacts at the seams.
"""

from __future__ import annotations

import logging

from .artefacts import ArtefactStore
from .context import Services
from .errors import ServiceNotConfigured, UnsupportedFormat
from .imageconv import extract_pages_typed, is_multipage, to_vlm_png
from .mimetypes import LIBREOFFICE_TYPES, MARKITDOWN_TYPES, PASSTHROUGH_TYPES
from .protocols import ImageCaptioner, OleConverter, OoxmlExtractor, PageRenderer, PdfExtractor
from .services.image_postprocess import IMAGE_RE, caption_images, label_images
from .tracing import Service, Span, Trace
from .types import (
    ExtractedDocument,
    ImageFile,
    Markdown,
    OleOfficeDocument,
    OoxmlDocument,
    PdfContent,
    SubmittedFile,
    VlmImagePNG,
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


async def caption_image(image: VlmImagePNG, deadline: float, span: Span, captioner: ImageCaptioner) -> Markdown:
    """Single VLM-ready image → descriptive markdown."""
    with span.span(Service.CAPTIONING, service="openai/gpt-4o") as cap_span:
        return await captioner.caption(image, deadline, cap_span)


async def caption_standalone(file: SubmittedFile, deadline: float, span: Span, captioner: ImageCaptioner) -> Markdown:
    """Standalone image file (any format, possibly multi-page) → markdown."""
    if not captioner.is_available():
        raise ServiceNotConfigured(
            "Image processing requires the captioning service. "
            "Set CAPTIONING_ENABLED=true in .env and ensure the captioning container is running."
        )

    image = ImageFile(data=file.data, mime_type=file.mime_type)

    if is_multipage(file.mime_type):
        with span.span(Service.EXTRACT_PAGES) as ep_span:
            pages = extract_pages_typed(image)
            ep_span.set(page_count=len(pages))

        captions: list[Markdown] = []
        with span.span(Service.CAPTIONING, service="openai/gpt-4o", page_count=len(pages)) as cap_span:
            for i, page_png in enumerate(pages):
                with cap_span.span(f"page[{i}]") as page_span:
                    cap = await captioner.caption(page_png, deadline, page_span)
                captions.append(cap)
        return Markdown("\n\n---\n\n".join(captions))

    png = to_vlm_png(image)
    return await caption_image(png, deadline, span, captioner)


async def resolve_images(doc: ExtractedDocument, deadline: float, span: Span, captioner: ImageCaptioner) -> Markdown:
    """Replace base64 image references in extracted markdown with captions."""
    return await caption_images(doc.markdown, doc.images, deadline, span, captioner)


def label_extracted_images(doc: ExtractedDocument) -> Markdown:
    """Replace base64 image references with classification labels (no VLM)."""
    return label_images(doc.markdown, doc.images)


async def render_thumbnails(pdf: PdfContent, renderer: PageRenderer) -> list[bytes]:
    """PDF → list of PNG page thumbnails."""
    result = await renderer.render(pdf)
    return result.pages


# ---------------------------------------------------------------------------
# Router — composes steps, stores artefacts at the seams
# ---------------------------------------------------------------------------


async def convert(
    file: SubmittedFile,
    deadline: float,
    trace: Trace,
    svc: Services,
    artefacts: ArtefactStore | None = None,
) -> Markdown:
    """Convert any supported file to markdown.

    Artefacts (thumbnails, converted PDF, extracted images) are stored
    via the ArtefactStore as a side effect. The return value is the
    extracted markdown text.
    """
    parent = trace.root
    mime = file.mime_type

    # Text passthrough
    if mime in PASSTHROUGH_TYPES:
        with parent.span(Service.PASSTHROUGH):
            pass
        return extract_text(file)

    # Standalone images
    if mime.startswith("image/"):
        return await caption_standalone(file, deadline, parent, svc.captioner)

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

        # Caption or label embedded images
        if IMAGE_RE.search(doc_ext.markdown):
            if svc.captioner.is_available():
                return await resolve_images(doc_ext, deadline, parent, svc.captioner)
            else:
                return label_extracted_images(doc_ext)

        return doc_ext.markdown

    raise UnsupportedFormat(mime)


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
