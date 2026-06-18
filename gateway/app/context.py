"""Services container — bundles all dependencies for handlers and workers."""

from dataclasses import dataclass

from .protocols import (
    BlobStore,
    ImageExtractor,
    JobStore,
    OleConverter,
    OoxmlExtractor,
    PageRenderer,
    PdfTextExtractor,
    Queue,
    UserResolver,
)
from .quota import QuotaService
from .telemetry import TelemetryEmitter


@dataclass
class Services:
    """All external dependencies, constructed once at startup."""

    blobs: BlobStore
    jobs: JobStore
    users: UserResolver
    queue: Queue
    quota: QuotaService
    telemetry: TelemetryEmitter
    pdf_text_extractor: PdfTextExtractor
    pdf_image_extractor: ImageExtractor
    ole_converter: OleConverter
    ooxml_extractor: OoxmlExtractor
    page_renderer: PageRenderer
