"""Worker process — thin wiring layer.

Constructs Services at startup, main loop calls process_job.
No business logic here.
"""

import asyncio
import logging
import os

from .blob_azure import AzureBlobStore
from .context import Services
from .jobs_table import TableJobStore
from .process import process_job
from .protocols import JobStatus
from .queue import RedisQueue
from .quota import QuotaService, get_redis
from .sweep import run_sweep_loop
from .telemetry import JobReclaimed, JobSkippedIdempotent, PostHogEmitter
from .user_resolver import TableUserResolver

logger = logging.getLogger(__name__)


async def run():
    """Main worker loop — dequeue and process jobs forever."""
    logger.info("Worker starting")
    r = await get_redis()
    if r is None:
        raise RuntimeError("REDIS_URL is required for the worker")

    blob_url = os.environ.get("BLOB_STORAGE_URL", "")
    blob_conn = os.environ.get("BLOB_STORAGE_CONNECTION_STRING", "")
    table_url = os.environ.get("TABLE_STORAGE_URL", "")
    table_conn = os.environ.get("TABLE_STORAGE_CONNECTION_STRING", "")

    queue = RedisQueue(r)
    svc = Services(
        blobs=AzureBlobStore(account_url=blob_url, connection_string=blob_conn),
        jobs=TableJobStore(endpoint=table_url, connection_string=table_conn),
        users=TableUserResolver(r, endpoint=table_url, connection_string=table_conn),
        queue=queue,
        quota=QuotaService(r, endpoint=table_url, connection_string=table_conn),
        telemetry=PostHogEmitter(),
    )
    await queue.ensure_group()
    asyncio.create_task(run_sweep_loop(svc))
    logger.info("Worker ready, waiting for jobs")

    while True:
        job = await svc.queue.dequeue(timeout=5000)
        if job is None:
            continue

        if job.reclaimed:
            logger.info("Reclaimed stale job %s via XAUTOCLAIM", job.job_id)
            svc.telemetry.emit(JobReclaimed(job_id=job.job_id))

        logger.info("Processing job %s (%s, %s)", job.job_id, job.mime_type, job.filename)

        # Idempotency guard: skip jobs already in a terminal state
        meta = svc.jobs.get_by_job_id(job.job_id)
        if meta and meta.status in (JobStatus.OK, JobStatus.DELETED):
            logger.info("Job %s already %s — skipping", job.job_id, meta.status)
            svc.telemetry.emit(JobSkippedIdempotent(job_id=job.job_id, current_status=meta.status))
            await svc.queue.acknowledge(job)
            continue

        user = await svc.users.resolve(job.sub_id)
        if user is None or isinstance(user, str):
            logger.error("Job %s has unmapped subscription %s — skipping", job.job_id, job.sub_id)
            await svc.queue.acknowledge(job)
            continue

        beat = svc.queue.heartbeat(job)
        try:
            proc = await process_job(job, user, svc)
        finally:
            beat.cancel()
        await svc.queue.store_result(job.job_id, proc.job_result)
        await svc.queue.acknowledge(job)

        # On failure: refund quota so user can retry
        if proc.job_result.status == "error" and job.sub_id and proc.file_size > 0:
            await svc.quota.refund(job.sub_id, proc.file_size)
            logger.info("Job %s failed — refunded %d bytes", job.job_id, proc.file_size)

        logger.info("Job %s completed with status %s (acked)", job.job_id, proc.job_result.status)


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    logging.getLogger("azure").setLevel(logging.WARNING)
    asyncio.run(run())


if __name__ == "__main__":
    main()
