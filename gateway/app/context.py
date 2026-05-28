"""Services container — bundles all dependencies for handlers and workers."""

from dataclasses import dataclass

from .protocols import BlobStore, JobStore, Queue, UserResolver
from .quota import QuotaService


@dataclass
class Services:
    """All external dependencies, constructed once at startup."""

    blobs: BlobStore
    jobs: JobStore
    users: UserResolver
    queue: Queue
    quota: QuotaService
