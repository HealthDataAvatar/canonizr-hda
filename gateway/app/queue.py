"""Redis Streams implementation of the Queue protocol.

Uses consumer groups for at-least-once delivery:
- Gateway XADDs jobs to the stream
- Workers XREADGROUP to claim jobs
- Workers XACK after storing results
- Stale pending jobs (crashed workers) are reclaimed via XAUTOCLAIM
"""

import asyncio
import os
import uuid

import redis.asyncio as aioredis

from .keys import job_result
from .protocols import Job, JobResult

STREAM_KEY = "stream:convert"
GROUP_NAME = "workers"
CONSUMER_NAME = os.environ.get("HOSTNAME", f"worker-{uuid.uuid4().hex[:8]}")
CLAIM_MIN_IDLE_MS = int(os.environ.get("QUEUE_CLAIM_IDLE_MS", "90000"))
HEARTBEAT_INTERVAL = int(os.environ.get("QUEUE_HEARTBEAT_SECONDS", "30"))
RESULT_TTL = 86_400  # 24 hours


class RedisQueue:
    """Queue backed by Redis Streams + SET/GET for results."""

    def __init__(self, r: aioredis.Redis | aioredis.RedisCluster):
        self._r = r

    # -- Gateway operations --

    async def enqueue(self, job: Job) -> str:
        await self._r.xadd(STREAM_KEY, job.to_fields())  # type: ignore[arg-type]
        return job.job_id

    async def get_result(self, job_id: str) -> JobResult | None:
        data = await self._r.get(job_result(job_id=job_id))
        if data is None:
            return None
        return JobResult.deserialize(data)

    # -- Worker operations --

    async def dequeue(self, timeout: int = 5000) -> Job | None:
        """Dequeue a job. Polls without blocking (cluster-safe).

        Azure Managed Redis uses clustering even on the smallest tier.
        Blocking XREADGROUP doesn't work across cluster slot redirects,
        so we poll with a short sleep instead.
        """
        deadline = asyncio.get_event_loop().time() + timeout / 1000
        poll_interval = 0.5  # seconds

        while True:
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
                job = Job.from_fields(stream_id, fields)
                job.reclaimed = True
                return job

            # 2. Non-blocking read for new messages
            results = await self._r.xreadgroup(
                GROUP_NAME,
                CONSUMER_NAME,
                {STREAM_KEY: ">"},
                count=1,
                block=None,
            )
            if results:
                stream_id, fields = results[0][1][0]
                return Job.from_fields(stream_id, fields)

            # 3. No messages — sleep and retry until timeout
            if asyncio.get_event_loop().time() >= deadline:
                return None
            await asyncio.sleep(poll_interval)

    def heartbeat(self, job: Job) -> asyncio.Task:
        """Start a background heartbeat that re-claims the message to reset idle time.

        Cancel the returned task when processing is done.
        """

        async def _beat():
            while True:
                await asyncio.sleep(HEARTBEAT_INTERVAL)
                try:
                    await self._r.xclaim(
                        STREAM_KEY,
                        GROUP_NAME,
                        CONSUMER_NAME,
                        min_idle_time=0,
                        message_ids=[job.stream_id],
                    )
                except Exception:
                    pass  # best-effort; next beat will retry

        return asyncio.create_task(_beat())

    async def acknowledge(self, job: Job) -> None:
        await self._r.xack(STREAM_KEY, GROUP_NAME, job.stream_id)

    async def store_result(self, job_id: str, result: JobResult) -> None:
        await self._r.set(job_result(job_id=job_id), result.serialize(), ex=RESULT_TTL)

    # -- Startup --

    async def ensure_group(self) -> None:
        try:
            await self._r.xgroup_create(STREAM_KEY, GROUP_NAME, id="0", mkstream=True)
        except aioredis.ResponseError as e:
            if "BUSYGROUP" not in str(e):
                raise
