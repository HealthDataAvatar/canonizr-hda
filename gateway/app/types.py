"""Domain types for the conversion pipeline.

These are the typed intermediates that flow between pipeline steps.
Protocols and implementations both import from here.
"""

from __future__ import annotations

import json
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
class EmbeddedImage:
    """Image losslessly extracted from a PDF."""

    data: bytes
    mime_type: str  # image/jpeg, image/png, etc.
    page: int  # 0-based page index
    label: str = ""  # e.g. "Image from page 3"


@dataclass
class ExtractedTable:
    """A single table extracted from a PDF page."""

    page: int  # 0-based page index
    headers: list[str]  # column headers (may be empty)
    rows: list[list[str]]  # data rows (excludes header row)
    accuracy: float  # parser confidence 0-1

    def to_markdown(self) -> str:
        """Render as a pipe-delimited markdown table."""
        if not self.headers and not self.rows:
            return ""
        cols = self.headers or [f"Col {i + 1}" for i in range(len(self.rows[0]))]
        lines = [
            "| " + " | ".join(cols) + " |",
            "| " + " | ".join("---" for _ in cols) + " |",
        ]
        for row in self.rows:
            lines.append("| " + " | ".join(row) + " |")
        return "\n".join(lines)

    def to_json(self) -> str:
        """Structured JSON with headers + rows for programmatic use."""
        return json.dumps({"page": self.page, "headers": self.headers, "rows": self.rows, "accuracy": self.accuracy})


@dataclass
class ExtractedTables:
    """All tables extracted from a PDF."""

    tables: list[ExtractedTable] = field(default_factory=list)


@dataclass
class PageRenders:
    """Rendered pages from a PDF — full-size PNGs and tiny WebP previews."""

    pages: list[bytes]  # full-size PNG bytes per page
    previews: list[bytes]  # small WebP bytes per page
