"""Fake implementations of all protocols for unit testing.

No patching, no mocking — just pass these to handlers.
Type checker verifies they satisfy the protocols.
"""

from __future__ import annotations

from app.protocols import Job, JobMeta, JobResult, JobStatus, UserContext
from app.telemetry import JobTelemetry, UpstreamRequest


class FakeRedis:
    """Minimal async Redis fake backed by a dict."""

    def __init__(self):
        self._data: dict[str, str] = {}
        self._ttls: dict[str, int] = {}

    async def get(self, key: str) -> str | None:
        return self._data.get(key)

    async def set(self, key: str, value: str, ex: int | None = None) -> None:
        self._data[key] = str(value)
        if ex:
            self._ttls[key] = ex

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

    async def resolve(self, sub_id: str) -> UserContext | None | str:
        return self._mappings.get(sub_id)

    def add(self, sub_id: str, ctx: UserContext) -> None:
        self._mappings[sub_id] = ctx


class FakeEmitter:
    """Collects telemetry events for test assertions."""

    def __init__(self):
        self.events: list[JobTelemetry] = []
        self.upstream_requests: list[UpstreamRequest] = []

    def emit_job_completed(self, event: JobTelemetry) -> None:
        self.events.append(event)

    def emit_upstream_request(self, event: UpstreamRequest) -> None:
        self.upstream_requests.append(event)
