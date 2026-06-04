"""Services container — bundles all dependencies for handlers and workers."""

from dataclasses import dataclass

from .protocols import (
    BlobStore,
    ImageCaptioner,
    JobStore,
    OleConverter,
    OoxmlExtractor,
    PageRenderer,
    PdfExtractor,
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
    captioner: ImageCaptioner
    pdf_extractor: PdfExtractor
    ole_converter: OleConverter
    ooxml_extractor: OoxmlExtractor
    page_renderer: PageRenderer
