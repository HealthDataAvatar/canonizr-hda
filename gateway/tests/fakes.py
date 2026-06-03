"""Fake implementations of all protocols for unit testing.

No patching, no mocking — just pass these to handlers.
Type checker verifies they satisfy the protocols.
"""

from __future__ import annotations

import asyncio
from typing import Any

from app.protocols import Job, JobMeta, JobResult, JobStatus, UserContext, VisionResult
from app.response import ConvertResult


class FakeRedis:
    """Minimal async Redis fake backed by a dict."""

    def __init__(self):
        self._data: dict[str, str] = {}
        self._ttls: dict[str, int] = {}

    async def get(self, key: str) -> str | None:
        return self._data.get(key)

    async def set(self, key: str, value: str, ex: int | None = None, nx: bool = False) -> bool | None:
        if nx and key in self._data:
            return False
        self._data[key] = str(value)
        if ex:
            self._ttls[key] = ex
        return True

    async def incr(self, key: str) -> int:
        val = int(self._data.get(key, "0")) + 1
        self._data[key] = str(val)
        return val

    async def incrby(self, key: str, amount: int) -> int:
        val = int(self._data.get(key, "0")) + amount
        self._data[key] = str(val)
        return val

    async def decrby(self, key: str, amount: int) -> int:
        val = int(self._data.get(key, "0")) - amount
        self._data[key] = str(val)
        return val

    async def expire(self, key: str, ttl: int) -> None:
        self._ttls[key] = ttl

    async def delete(self, key: str) -> None:
        self._data.pop(key, None)
        self._ttls.pop(key, None)

    async def xadd(self, stream: str, fields: dict) -> str:
        """Fake XADD — stores nothing, returns a fake stream ID."""
        return "1-0"

    async def xack(self, stream: str, group: str, *ids: str) -> int:
        return len(ids)

    async def xgroup_create(self, stream: str, group: str, id: str = "0", mkstream: bool = False) -> None:
        pass

    def seed(self, key: str, value: str | int) -> None:
        self._data[key] = str(value)


class FakeBlobStore:
    """In-memory blob store."""

    def __init__(self):
        self._data: dict[str, bytes] = {}

    async def put(self, key: str, data: bytes) -> None:
        self._data[key] = data

    async def get(self, key: str) -> bytes | None:
        return self._data.get(key)

    async def delete(self, key: str) -> None:
        self._data.pop(key, None)

    async def delete_prefix(self, prefix: str) -> int:
        keys = [k for k in self._data if k.startswith(prefix)]
        for k in keys:
            del self._data[k]
        return len(keys)


class FakeJobStore:
    """In-memory job metadata store."""

    def __init__(self):
        self._jobs: dict[tuple[str, str], JobMeta] = {}

    def create(self, meta: JobMeta) -> None:
        self._jobs[(meta.user_id, meta.job_id)] = meta

    def get(self, user_id: str, job_id: str) -> JobMeta | None:
        return self._jobs.get((user_id, job_id))

    def get_by_job_id(self, job_id: str) -> JobMeta | None:
        for (_, jid), meta in self._jobs.items():
            if jid == job_id:
                return meta
        return None

    def update(self, meta: JobMeta) -> None:
        self._jobs[(meta.user_id, meta.job_id)] = meta

    def list_for_user(self, user_id: str, limit: int = 50) -> list[JobMeta]:
        jobs = [m for (uid, _), m in self._jobs.items() if uid == user_id]
        jobs.sort(key=lambda j: j.created_at, reverse=True)
        return jobs[:limit]

    def mark_deleted(self, user_id: str, job_id: str) -> bool:
        meta = self.get(user_id, job_id)
        if meta is None:
            return False
        meta.status = JobStatus.DELETED
        return True

    def list_expired(self, before: str) -> list[JobMeta]:
        return [
            m
            for m in self._jobs.values()
            if m.status != JobStatus.DELETED and m.retention_expires and m.retention_expires < before
        ]

    def list_processing(self, older_than: str) -> list[JobMeta]:
        return [m for m in self._jobs.values() if m.status == JobStatus.PROCESSING and m.created_at < older_than]

    def list_deleted(self) -> list[JobMeta]:
        return [m for m in self._jobs.values() if m.status == JobStatus.DELETED]

    def strip_pii(self, user_id: str) -> int:
        count = 0
        for (uid, _), meta in self._jobs.items():
            if uid == user_id:
                meta.original_filename = ""
                meta.status = JobStatus.DELETED
                count += 1
        return count


class FakeQueue:
    """In-memory job queue."""

    def __init__(self):
        self._jobs: list[Job] = []
        self._results: dict[str, JobResult] = {}

    async def enqueue(self, job: Job) -> str:
        self._jobs.append(job)
        return job.job_id

    async def get_result(self, job_id: str) -> JobResult | None:
        return self._results.get(job_id)

    async def dequeue(self, timeout: int = 5000) -> Job | None:
        return self._jobs.pop(0) if self._jobs else None

    def heartbeat(self, job: Job) -> asyncio.Task:
        async def _noop():
            await asyncio.sleep(1e9)

        return asyncio.create_task(_noop())

    async def acknowledge(self, job: Job) -> None:
        pass

    async def store_result(self, job_id: str, result: JobResult) -> None:
        self._results[job_id] = result

    async def ensure_group(self) -> None:
        pass


class FakeUserResolver:
    """In-memory user resolver. Seed with sub_id → UserContext mappings."""

    def __init__(self, mappings: dict[str, UserContext] | None = None):
        self._mappings = mappings or {}

    async def resolve(self, sub_id: str):
        return self._mappings.get(sub_id)

    def add(self, sub_id: str, ctx: UserContext) -> None:
        self._mappings[sub_id] = ctx


class FakeEmitter:
    """Collects telemetry events for test assertions."""

    def __init__(self):
        self.events: list[Any] = []

    def emit(self, event: Any) -> None:
        self.events.append(event)

    def shutdown(self) -> None:
        pass


class FakeCaptioner:
    """Injectable captioning service. Responses can be VisionResult, ConvertResult, or Exception."""

    def __init__(self, responses: list | None = None, available: bool = True):
        self._responses = list(responses or [])
        self._available = available
        self.calls: list[tuple[str, str]] = []

    def _next(self):
        r = self._responses.pop(0)
        if isinstance(r, Exception):
            raise r
        return r

    def is_available(self) -> bool:
        return self._available

    async def describe(self, image_b64: str, mime_type: str, deadline: float, parent) -> VisionResult:
        self.calls.append(("describe", mime_type))
        return self._next()

    async def describe_file(self, image_bytes: bytes, mime_type: str, deadline: float, parent) -> ConvertResult:
        self.calls.append(("describe_file", mime_type))
        return self._next()


class FakePdfExtractor:
    """Injectable PDF extractor. Responses are (markdown, pictures) tuples or Exceptions."""

    def __init__(self, responses: list | None = None):
        self._responses = list(responses or [])
        self.calls: list[int] = []

    async def convert(self, file_bytes: bytes, mime_type: str, deadline: float, parent) -> tuple[str, list[dict]]:
        self.calls.append(len(file_bytes))
        r = self._responses.pop(0)
        if isinstance(r, Exception):
            raise r
        return r


class FakeOfficeConverter:
    """Injectable office converter. Responses are (pdf_bytes, mime) tuples or Exceptions."""

    def __init__(self, responses: list | None = None, available: bool = True):
        self._responses = list(responses or [])
        self._available = available
        self.calls: list[tuple[str, str]] = []

    def is_available(self) -> bool:
        return self._available

    async def convert(
        self, file_bytes: bytes, mime_type: str, filename: str, deadline: float, parent
    ) -> tuple[bytes, str]:
        self.calls.append(("convert", mime_type))
        r = self._responses.pop(0)
        if isinstance(r, Exception):
            raise r
        return r
