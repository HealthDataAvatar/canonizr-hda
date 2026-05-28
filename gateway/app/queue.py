"""Redis Streams implementation of the Queue protocol.

Uses consumer groups for at-least-once delivery:
- Gateway XADDs jobs to the stream
- Workers XREADGROUP to claim jobs
- Workers XACK after storing results
- Stale pending jobs (crashed workers) are reclaimed via XAUTOCLAIM
"""

import os
import uuid

import redis.asyncio as aioredis

from .keys import dedupe, job_result
from .protocols import Job, JobResult

STREAM_KEY = "stream:convert"
GROUP_NAME = "workers"
CONSUMER_NAME = os.environ.get("HOSTNAME", f"worker-{uuid.uuid4().hex[:8]}")
CLAIM_MIN_IDLE_MS = int(os.environ.get("QUEUE_CLAIM_IDLE_MS", "60000"))
RESULT_TTL = 86_400  # 24 hours


class RedisQueue:
    """Queue backed by Redis Streams + SET/GET for results and dedup."""

    def __init__(self, r: aioredis.Redis):
        self._r = r

    # -- Gateway operations --

    async def enqueue(self, job: Job) -> str:
        await self._r.xadd(STREAM_KEY, job.to_fields())  # type: ignore[arg-type]
        return job.job_id

    async def check_dedupe(self, sub_id: str, doc_hash: str) -> str | None:
        existing = await self._r.get(dedupe(sub_id=sub_id, doc_hash=doc_hash))
        return existing if existing else None

    async def set_dedupe(self, sub_id: str, doc_hash: str, job_id: str) -> None:
        await self._r.set(dedupe(sub_id=sub_id, doc_hash=doc_hash), job_id, ex=RESULT_TTL)

    async def get_result(self, job_id: str) -> JobResult | None:
        data = await self._r.get(job_result(job_id=job_id))
        if data is None:
            return None
        return JobResult.deserialize(data)

    # -- Worker operations --

    async def dequeue(self, timeout: int = 5000) -> Job | None:
        # 1. Try to reclaim stale pending messages
        stale = await self._r.xautoclaim(
            STREAM_KEY,
            GROUP_NAME,
            CONSUMER_NAME,
            min_idle_time=CLAIM_MIN_IDLE_MS,
            start_id="0-0",
            count=1,
        )
        if stale and stale[1]:
            stream_id, fields = stale[1][0]
            return Job.from_fields(stream_id, fields)

        # 2. Read new messages
        results = await self._r.xreadgroup(
            GROUP_NAME,
            CONSUMER_NAME,
            {STREAM_KEY: ">"},
            count=1,
            block=timeout,
        )
        if not results:
            return None
        stream_id, fields = results[0][1][0]
        return Job.from_fields(stream_id, fields)

    async def acknowledge(self, job: Job) -> None:
        await self._r.xack(STREAM_KEY, GROUP_NAME, job.stream_id)

    async def store_result(self, job_id: str, result: JobResult) -> None:
        await self._r.set(job_result(job_id=job_id), result.serialize(), ex=RESULT_TTL)

    async def delete_dedupe(self, sub_id: str, doc_hash: str) -> None:
        await self._r.delete(dedupe(sub_id=sub_id, doc_hash=doc_hash))

    # -- Startup --

    async def ensure_group(self) -> None:
        try:
            await self._r.xgroup_create(STREAM_KEY, GROUP_NAME, id="0", mkstream=True)
        except aioredis.ResponseError as e:
            if "BUSYGROUP" not in str(e):
                raise
