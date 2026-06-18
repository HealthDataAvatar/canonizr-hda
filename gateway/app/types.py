"""Domain types for the conversion pipeline.

These are the typed intermediates that flow between pipeline steps.
Protocols and implementations both import from here.
"""

from __future__ import annotations

from dataclasses import dataclass
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
class EmbeddedImage:
    """Image losslessly extracted from a PDF."""

    data: bytes
    mime_type: str  # image/jpeg, image/png, etc.
    page: int  # 0-based page index
    label: str = ""  # e.g. "Image from page 3"


@dataclass
class PageRenders:
    """Rendered pages from a PDF — full-size PNGs, tiny WebP previews, and document page labels."""

    pages: list[bytes]  # full-size PNG bytes per page
    previews: list[bytes]  # small WebP bytes per page
    page_labels: list[str]  # document-defined labels (e.g. "iv", "1", "A-1")
