"""Services container — bundles all dependencies for handlers and workers."""

from dataclasses import dataclass

from .protocols import BlobStore, Captioner, JobStore, OfficeConverter, PdfExtractor, Queue, UserResolver
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
    captioner: Captioner
    pdf_extractor: PdfExtractor
    office_converter: OfficeConverter
