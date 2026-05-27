"""Redis-backed job queue for async document conversion.

Redis handles: job queue, result signals, quota counters (all small).
Blob storage handles: encrypted file inputs and outputs (potentially large).
"""

import json
import uuid
from dataclasses import dataclass, asdict
from typing import Optional

import redis.asyncio as aioredis

QUEUE_KEY = "queue:convert"


@dataclass
class Job:
    job_id: str
    sub_id: str
    mime_type: str
    filename: str
    deadline_seconds: float
    verbose: bool = False
    accept_header: str = "application/json"

    @staticmethod
    def create(**kwargs) -> "Job":
        return Job(job_id=uuid.uuid4().hex, **kwargs)

    def serialize(self) -> str:
        return json.dumps(asdict(self))

    @staticmethod
    def deserialize(data: str) -> "Job":
        return Job(**json.loads(data))

    @property
    def input_blob_key(self) -> str:
        return f"{self.job_id}/input"

    @property
    def output_blob_key(self) -> str:
        return f"{self.job_id}/output"


@dataclass
class JobResult:
    job_id: str
    status: str  # "ok" or "error"
    error_detail: str = ""  # only set when status == "error"
    status_code: int = 200

    def serialize(self) -> str:
        return json.dumps(asdict(self))

    @staticmethod
    def deserialize(data: str) -> "JobResult":
        return JobResult(**json.loads(data))


async def enqueue(r: aioredis.Redis, job: Job) -> str:
    """Add a job to the queue. Returns the job_id."""
    await r.lpush(QUEUE_KEY, job.serialize())
    return job.job_id


async def dequeue(r: aioredis.Redis, timeout: int = 5) -> Optional[Job]:
    """Block-wait for a job from the queue. Returns None on timeout."""
    result = await r.brpop(QUEUE_KEY, timeout=timeout)
    if result is None:
        return None
    _, data = result
    return Job.deserialize(data)


async def store_result(r: aioredis.Redis, job_id: str, result: JobResult, ttl: int = 300):
    """Signal that a job result is ready.

    LPUSH to result:{job_id} for BLPOP waiters (gateway long-poll).
    SET resultcache:{job_id} with TTL for polling.
    The actual output payload is in blob storage, not Redis.
    """
    serialized = result.serialize()
    pipe = r.pipeline()
    pipe.lpush(f"result:{job_id}", serialized)
    pipe.set(f"resultcache:{job_id}", serialized, ex=ttl)
    await pipe.execute()


async def await_result(r: aioredis.Redis, job_id: str, timeout: float) -> Optional[JobResult]:
    """Block-wait for a job result signal. Returns None on timeout."""
    result = await r.blpop(f"result:{job_id}", timeout=int(timeout))
    if result is None:
        return None
    _, data = result
    return JobResult.deserialize(data)


async def get_result(r: aioredis.Redis, job_id: str) -> Optional[JobResult]:
    """Poll for a job result signal. Returns None if not found."""
    data = await r.get(f"resultcache:{job_id}")
    if data is None:
        return None
    return JobResult.deserialize(data)
