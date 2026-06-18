"""Protocol definitions for all pluggable services.

Implementations satisfy these protocols. Fakes in tests satisfy them too.
The type checker verifies conformance without inheritance.
"""

from __future__ import annotations

import asyncio
import json
import secrets
from dataclasses import asdict, dataclass
from enum import StrEnum
from typing import Protocol

from .tracing import Span
from .types import (
    EmbeddedImage,
    ExtractedTables,
    Markdown,
    OleOfficeDocument,
    OoxmlDocument,
    PageRenders,
    PdfContent,
)

# Job lifecycle defaults (one home, imported by handlers/worker/sweep).
DEFAULT_RETENTION_SECONDS = 86_400  # 24 hours
DEFAULT_JOB_DEADLINE_S = 300.0  # total processing budget per job

# ---------------------------------------------------------------------------
# Blob storage
# ---------------------------------------------------------------------------


class BlobStore(Protocol):
    async def put(self, key: str, data: bytes) -> None: ...
    async def get(self, key: str) -> bytes | None: ...
    async def delete(self, key: str) -> None: ...
    async def delete_prefix(self, prefix: str) -> int: ...


# ---------------------------------------------------------------------------
# Job metadata (Table Storage)
# ---------------------------------------------------------------------------


class JobType(StrEnum):
    CANONIZE = "canonize"


class JobStatus(StrEnum):
    PROCESSING = "processing"
    OK = "ok"
    ERROR = "error"
    DELETED = "deleted"


def generate_job_id() -> str:
    """16-char URL-safe random ID (~96 bits entropy)."""
    return secrets.token_urlsafe(12)


@dataclass
class JobMeta:
    """Job metadata stored in the job store."""

    user_id: str
    job_id: str
    sub_id: str
    job_type: str = ""
    key_id: str = ""
    original_filename: str = "document"
    mime_type: str = ""
    input_bytes: int = 0
    input_hash: str = ""
    status: JobStatus = JobStatus.PROCESSING
    detail: str = ""
    period_start: str = ""  # billing period the quota charge landed in — refund must target the same one
    created_at: str = ""
    completed_at: str = ""
    retention_expires: str = ""
    steps: str = ""  # JSON span tree from Trace.to_dict()
    price_per_unit: float = 0.0
    artefacts: str = ""  # JSON manifest from ArtefactStore.manifest_json()


@dataclass
class JobPage:
    """Paginated job listing result."""

    jobs: list[JobMeta]
    continuation: str | None = None


class JobStore(Protocol):
    def create(self, meta: JobMeta) -> None: ...
    def get(self, job_id: str) -> JobMeta | None: ...
    def update(self, meta: JobMeta) -> None: ...
    def list_for_user(self, user_id: str, page_size: int = 20, continuation: str | None = None) -> JobPage: ...
    def mark_deleted(self, job_id: str) -> bool: ...
    def list_expired(self, before: str) -> list[JobMeta]: ...
    def list_deleted(self) -> list[JobMeta]: ...
    def list_processing(self, older_than: str) -> list[JobMeta]: ...


# ---------------------------------------------------------------------------
# User resolution
# ---------------------------------------------------------------------------


@dataclass
class UserContext:
    """Resolved user context for a request."""

    user_id: str
    encryption_key: bytes  # 32-byte AES-256 key
    price_per_unit: float
    key_id: str = ""
    billing_anchor_day: int = 1  # day of month (1-31) for billing period start


@dataclass
class ResolveRejected:
    """User was found but the request should be rejected."""

    reason: str
    status: int  # HTTP status code (402 billing, 403 blocked)


@dataclass
class ResolveMisconfigured:
    """User was found but their account is broken (missing key, config, etc)."""

    reason: str


ResolveResult = UserContext | ResolveRejected | ResolveMisconfigured | None


class UserResolver(Protocol):
    async def resolve(self, sub_id: str) -> ResolveResult: ...


# ---------------------------------------------------------------------------
# Redis
# ---------------------------------------------------------------------------


class RedisKVCache(Protocol):
    """Async Redis client — get/set only (decode_responses=True)."""

    async def get(self, key: str) -> str | None: ...
    async def set(self, key: str, value: str, ex: int | None = None, nx: bool = False) -> bool | None: ...


class RedisQuotaCache(RedisKVCache, Protocol):
    """RedisKVCache plus counters and expiry."""

    async def incr(self, key: str) -> int: ...
    async def incrby(self, key: str, amount: int) -> int: ...
    async def decrby(self, key: str, amount: int) -> int: ...
    async def expire(self, key: str, ttl: int) -> None: ...


# ---------------------------------------------------------------------------
# Job queue
# ---------------------------------------------------------------------------


@dataclass
class Job:
    """A conversion job. Data type — not tied to any queue backend."""

    job_id: str
    stream_id: str  # backend-specific ID (e.g. Redis stream message ID)
    sub_id: str
    mime_type: str
    filename: str
    deadline_seconds: float = DEFAULT_JOB_DEADLINE_S
    job_type: str = JobType.CANONIZE
    verbose: bool = False
    accept_header: str = "application/json"
    reclaimed: bool = False  # True if recovered via XAUTOCLAIM
    delivery_count: int = 1  # times this message has been delivered (XPENDING); >1 means redelivered

    @staticmethod
    def create(**kwargs) -> Job:
        return Job(job_id=generate_job_id(), stream_id="", **kwargs)

    def to_fields(self) -> dict[str, str]:
        """Serialize to a flat string dict (for Redis XADD or similar)."""
        return {
            "job_id": self.job_id,
            "sub_id": self.sub_id,
            "job_type": self.job_type,
            "mime_type": self.mime_type,
            "filename": self.filename,
            "deadline_seconds": str(self.deadline_seconds),
            "verbose": str(self.verbose),
            "accept_header": self.accept_header,
        }

    @staticmethod
    def from_fields(stream_id: str, fields: dict) -> Job:
        """Deserialize from a flat string dict."""
        return Job(
            job_id=fields["job_id"],
            stream_id=stream_id,
            sub_id=fields["sub_id"],
            mime_type=fields["mime_type"],
            filename=fields["filename"],
            deadline_seconds=float(fields["deadline_seconds"]),
            job_type=fields.get("job_type", JobType.CANONIZE),
            verbose=fields["verbose"] == "True",
            accept_header=fields.get("accept_header", "application/json"),
        )


@dataclass
class JobResult:
    """Result signal for a completed job."""

    job_id: str
    status: str  # "ok" or "error"
    detail: str = ""
    status_code: int = 200

    def serialize(self) -> str:
        return json.dumps(asdict(self))

    @staticmethod
    def deserialize(data: str) -> JobResult:
        return JobResult(**json.loads(data))


class Queue(Protocol):
    """Job queue — enqueue, dequeue, result storage."""

    # Gateway operations
    async def enqueue(self, job: Job) -> str: ...
    async def get_result(self, job_id: str) -> JobResult | None: ...

    # Worker operations
    async def dequeue(self, timeout: int = 5000) -> Job | None: ...
    def heartbeat(self, job: Job) -> asyncio.Task: ...
    async def acknowledge(self, job: Job) -> None: ...
    async def store_result(self, job_id: str, result: JobResult) -> None: ...

    # Startup
    async def ensure_group(self) -> None: ...


# ---------------------------------------------------------------------------
# Upstream service protocols
# ---------------------------------------------------------------------------


class OleConverter(Protocol):
    """Pre-2007 binary office → PDF via Gotenberg."""

    def is_available(self) -> bool: ...
    async def convert(self, doc: OleOfficeDocument, deadline: float, span: Span) -> PdfContent: ...


class PdfTextExtractor(Protocol):
    """PDF → markdown text with spatial layout (LiteParse)."""

    async def extract(self, pdf: PdfContent, span: Span) -> Markdown: ...


class ImageExtractor(Protocol):
    """PDF → losslessly extracted embedded images (pikepdf)."""

    async def extract(self, pdf: PdfContent, span: Span) -> list[EmbeddedImage]: ...


class TableExtractor(Protocol):
    """PDF → structured tables (Camelot)."""

    async def extract(self, pdf: PdfContent, span: Span) -> ExtractedTables: ...


class OoxmlExtractor(Protocol):
    """Modern office/HTML → markdown via MarkItDown."""

    async def extract(self, doc: OoxmlDocument) -> Markdown: ...


class PageRenderer(Protocol):
    """PDF → page thumbnail images."""

    async def render(self, pdf: PdfContent, dpi: int = 150) -> PageRenders: ...
