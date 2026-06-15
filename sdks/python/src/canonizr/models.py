"""Data models for the Canonizr SDK."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any, Literal


@dataclass(frozen=True)
class ArtefactMeta:
    """Metadata for a single artefact in the job manifest."""

    name: str
    mime_type: str
    size_bytes: int
    label: str = ""
    source_page: int | None = None


@dataclass(frozen=True)
class SubmitResult:
    """Returned immediately after submitting a file (202)."""

    job_id: str
    poll_url: str
    estimated_seconds: int
    input_bytes: int
    billable_units: int
    retention_seconds: int = 86_400

    @staticmethod
    def from_response(data: dict[str, Any]) -> SubmitResult:
        return SubmitResult(
            job_id=data["job_id"],
            poll_url=data["poll_url"],
            estimated_seconds=data["estimated_seconds"],
            input_bytes=data["input_bytes"],
            billable_units=data["billable_units"],
            retention_seconds=data.get("retention_seconds", 86_400),
        )


@dataclass(frozen=True)
class JobStatus:
    """Snapshot of a job's current state (single poll)."""

    job_id: str
    status: Literal["processing", "ok", "error", "expired"]
    metadata: dict[str, Any] | None = None
    artefacts: tuple[ArtefactMeta, ...] = ()
    expires_at: str | None = None
    detail: str | None = None

    @property
    def done(self) -> bool:
        return self.status != "processing"

    @staticmethod
    def from_response(data: dict[str, Any]) -> JobStatus:
        artefacts = tuple(ArtefactMeta(**a) for a in data.get("artefacts", []))
        return JobStatus(
            job_id=data["job_id"],
            status=data["status"],
            metadata=data.get("metadata"),
            artefacts=artefacts,
            expires_at=data.get("expires_at"),
            detail=data.get("detail"),
        )


# Type aliases for the artefact fetchers injected into result objects.
SyncFetcher = Callable[[str], bytes]
AsyncFetcher = Callable[[str], Awaitable[bytes]]


@dataclass(frozen=True)
class CanonizeResult:
    """Complete result of a canonize operation (sync).

    Wraps the job status and provides convenience access to artefacts.
    Artefact content is fetched lazily via the injected fetcher.
    """

    job_id: str
    status: JobStatus
    _fetch: SyncFetcher = field(repr=False)

    @property
    def artefacts(self) -> tuple[ArtefactMeta, ...]:
        return self.status.artefacts

    @property
    def metadata(self) -> dict[str, Any] | None:
        return self.status.metadata

    def get(self, name: str) -> bytes:
        """Fetch an artefact's content by name."""
        return self._fetch(name)

    def artefact_names(self) -> list[str]:
        return [a.name for a in self.artefacts]

    def has(self, name: str) -> bool:
        return any(a.name == name for a in self.artefacts)


@dataclass(frozen=True)
class AsyncCanonizeResult:
    """Complete result of a canonize operation (async).

    Same as CanonizeResult but with an async fetcher.
    """

    job_id: str
    status: JobStatus
    _fetch: AsyncFetcher = field(repr=False)

    @property
    def artefacts(self) -> tuple[ArtefactMeta, ...]:
        return self.status.artefacts

    @property
    def metadata(self) -> dict[str, Any] | None:
        return self.status.metadata

    async def get(self, name: str) -> bytes:
        """Fetch an artefact's content by name."""
        return await self._fetch(name)

    def artefact_names(self) -> list[str]:
        return [a.name for a in self.artefacts]

    def has(self, name: str) -> bool:
        return any(a.name == name for a in self.artefacts)
