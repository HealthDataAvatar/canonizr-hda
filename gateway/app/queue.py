"""Redis Streams-backed job queue for reliable async document conversion.

Uses consumer groups for at-least-once delivery:
- Gateway XADDs jobs to the stream
- Workers XREADGROUP to claim jobs
- Workers XACK after storing results
- Stale pending jobs (crashed workers) are reclaimed via XAUTOCLAIM

Redis handles: job queue, result signals, quota counters (all small).
Blob storage handles: encrypted file inputs and outputs (potentially large).
"""

import asyncio
import json
import os
import uuid
from dataclasses import asdict, dataclass

import redis.asyncio as aioredis

STREAM_KEY = "stream:convert"
GROUP_NAME = "workers"
CONSUMER_NAME = os.environ.get("HOSTNAME", f"worker-{uuid.uuid4().hex[:8]}")
# Time after which a pending job is considered stale and can be reclaimed
CLAIM_MIN_IDLE_MS = int(os.environ.get("QUEUE_CLAIM_IDLE_MS", "60000"))  # 1 minute


@dataclass
class Job:
    job_id: str
    stream_id: str  # Redis stream message ID, needed for XACK
    sub_id: str
    mime_type: str
    filename: str
    deadline_seconds: float
    verbose: bool = False
    accept_header: str = "application/json"

    @staticmethod
    def create(**kwargs) -> "Job":
        return Job(job_id=uuid.uuid4().hex, stream_id="", **kwargs)

    def to_fields(self) -> dict[str, str]:
        """Serialize to a flat dict for XADD."""
        return {
            "job_id": self.job_id,
            "sub_id": self.sub_id,
            "mime_type": self.mime_type,
            "filename": self.filename,
            "deadline_seconds": str(self.deadline_seconds),
            "verbose": str(self.verbose),
            "accept_header": self.accept_header,
        }

    @staticmethod
    def from_fields(stream_id: str, fields: dict) -> "Job":
        """Deserialize from XREADGROUP result."""
        return Job(
            job_id=fields["job_id"],
            stream_id=stream_id,
            sub_id=fields["sub_id"],
            mime_type=fields["mime_type"],
            filename=fields["filename"],
            deadline_seconds=float(fields["deadline_seconds"]),
            verbose=fields["verbose"] == "True",
            accept_header=fields.get("accept_header", "application/json"),
        )

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
    error_detail: str = ""
    status_code: int = 200

    def serialize(self) -> str:
        return json.dumps(asdict(self))

    @staticmethod
    def deserialize(data: str) -> "JobResult":
        return JobResult(**json.loads(data))


async def ensure_group(r: aioredis.Redis) -> None:
    """Create the consumer group if it doesn't exist."""
    try:
        await r.xgroup_create(STREAM_KEY, GROUP_NAME, id="0", mkstream=True)
    except aioredis.ResponseError as e:
        if "BUSYGROUP" not in str(e):
            raise


async def enqueue(r: aioredis.Redis, job: Job) -> str:
    """Add a job to the stream. Returns the job_id."""
    await r.xadd(STREAM_KEY, job.to_fields())  # type: ignore[arg-type]
    return job.job_id


async def dequeue(r: aioredis.Redis, timeout: int = 5000) -> Job | None:
    """Read the next job from the stream via consumer group.

    First tries to reclaim stale pending jobs (from crashed workers),
    then reads new jobs. Returns None on timeout.
    """
    # 1. Try to reclaim stale pending messages from crashed workers
    stale = await r.xautoclaim(
        STREAM_KEY,
        GROUP_NAME,
        CONSUMER_NAME,
        min_idle_time=CLAIM_MIN_IDLE_MS,
        start_id="0-0",
        count=1,
    )
    # xautoclaim returns (next_start_id, [(id, fields), ...], deleted_ids)
    if stale and stale[1]:
        stream_id, fields = stale[1][0]
        return Job.from_fields(stream_id, fields)

    # 2. Read new messages
    results = await r.xreadgroup(
        GROUP_NAME,
        CONSUMER_NAME,
        {STREAM_KEY: ">"},
        count=1,
        block=timeout,
    )
    if not results:
        return None

    # results = [[stream_name, [(stream_id, fields)]]]
    stream_id, fields = results[0][1][0]
    return Job.from_fields(stream_id, fields)


async def acknowledge(r: aioredis.Redis, job: Job) -> None:
    """Acknowledge a job as processed. Removes it from the pending list."""
    await r.xack(STREAM_KEY, GROUP_NAME, job.stream_id)


RESULT_KEY_PREFIX = "result:"
POLL_INTERVAL = 0.5  # seconds between polls


def result_key(job_id: str) -> str:
    """Redis key for job result. Single key per job, no pipelines needed."""
    return f"{RESULT_KEY_PREFIX}{job_id}"


async def store_result(r: aioredis.Redis, job_id: str, result: JobResult, ttl: int = 300):
    """Store job result in Redis with a TTL. Single SET — no pipelines, no LPUSH.

    The actual output payload is in blob storage, not Redis.
    This stores only the small JobResult metadata (status, job_id, error).
    """
    await r.set(result_key(job_id), result.serialize(), ex=ttl)


async def await_result(r: aioredis.Redis, job_id: str, timeout: float) -> JobResult | None:
    """Poll for a job result until it appears or timeout is reached.

    Polls every POLL_INTERVAL seconds. Returns None on timeout.
    Compatible with Redis Cluster (no BLPOP, single key GET).
    """
    elapsed = 0.0
    while elapsed < timeout:
        data = await r.get(result_key(job_id))
        if data is not None:
            return JobResult.deserialize(data)
        await asyncio.sleep(POLL_INTERVAL)
        elapsed += POLL_INTERVAL
    return None


async def get_result(r: aioredis.Redis, job_id: str) -> JobResult | None:
    """Single poll for a job result. Returns None if not ready."""
    data = await r.get(result_key(job_id))
    if data is None:
        return None
    return JobResult.deserialize(data)
