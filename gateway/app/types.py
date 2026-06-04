"""Domain types for the conversion pipeline.

These are the typed intermediates that flow between pipeline steps.
Protocols and implementations both import from here.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import NewType

Markdown = NewType("Markdown", str)


@dataclass
class SubmittedFile:
    """A user-submitted file — the pipeline entry point."""

    data: bytes
    mime_type: str
    filename: str


@dataclass
class OleOfficeDocument:
    """Pre-2007 binary office format (.doc, .ppt, .xls, .odt, etc.).

    Needs LibreOffice (via Gotenberg) to convert to PDF before extraction.
    """

    data: bytes
    mime_type: str
    filename: str


@dataclass
class OoxmlDocument:
    """XML-based office format (.docx, .pptx, .xlsx, .html, .epub, etc.).

    MarkItDown extracts markdown directly — no intermediate PDF.
    """

    data: bytes
    mime_type: str
    filename: str


@dataclass
class PdfContent:
    """PDF bytes."""

    data: bytes
    source_mime: str


@dataclass
class ImageFile:
    """Raw image in any format. Not yet validated for VLM consumption."""

    data: bytes
    mime_type: str


@dataclass
class VlmImagePNG:
    """PNG, downscaled to max dimension. Ready for any VLM."""

    data: bytes  # always PNG


@dataclass
class ExtractedImage:
    """Image extracted from a document by Docling, with classification metadata."""

    data: bytes
    mime_type: str
    label: str  # human-readable: "Bar Chart", "Logo"
    classifications: frozenset[str] = field(default_factory=frozenset)  # Docling labels: "bar_chart", "logo"


@dataclass
class ExtractedDocument:
    """Structured extraction from a PDF — markdown text with classified image references."""

    markdown: Markdown
    images: list[ExtractedImage] = field(default_factory=list)


@dataclass
class PageThumbnailPNGs:
    """Rendered page thumbnails from a PDF."""

    pages: list[bytes]  # PNG bytes per page
