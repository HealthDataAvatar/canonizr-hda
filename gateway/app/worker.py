"""Worker process — thin wiring layer.

Constructs Services at startup, main loop calls process_job.
No business logic here.
"""

import asyncio
import logging
import traceback

from .azure_clients import get_blob_service, get_table_service
from .blob_azure import AzureBlobStore
from .context import Services
from .jobs_table import TableJobStore
from .process import process_job
from .protocols import JobStatus
from .queue import RedisQueue
from .quota import QuotaService
from .redis_client import get_redis
from .sweep import run_sweep_loop
from .telemetry import JobReclaimed, JobSkippedIdempotent, PostHogEmitter, WorkerError
from .user_resolver import TableUserResolver

logger = logging.getLogger(__name__)

MAX_BACKOFF = 60
MAX_CONSECUTIVE_FAILURES = 20


async def run():
    """Main worker loop — dequeue and process jobs forever."""
    logger.info("Worker starting")
    r = await get_redis()
    if r is None:
        raise RuntimeError("REDIS_URL is required for the worker")

    table_svc = get_table_service()
    blob_svc = get_blob_service()

    queue = RedisQueue(r)
    svc = Services(
        blobs=AzureBlobStore(blob_svc),
        jobs=TableJobStore(table_svc),
        users=TableUserResolver(r, table_svc),
        queue=queue,
        quota=QuotaService(r, table_service=table_svc),
        telemetry=PostHogEmitter(),
    )
    await queue.ensure_group()
    asyncio.create_task(run_sweep_loop(svc))
    logger.info("Worker ready, waiting for jobs")

    consecutive_failures = 0

    while True:
        try:
            job = await svc.queue.dequeue(timeout=5000)
            if job is None:
                consecutive_failures = 0
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
                consecutive_failures = 0
                continue

            user = await svc.users.resolve(job.sub_id)
            if user is None or isinstance(user, str):
                logger.error("Job %s has unmapped subscription %s — skipping", job.job_id, job.sub_id)
                await svc.queue.acknowledge(job)
                consecutive_failures = 0
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
            consecutive_failures = 0

        except Exception as exc:
            consecutive_failures += 1
            job_id = job.job_id if "job" in dir() and job is not None else ""
            error_msg = traceback.format_exc()
            logger.error("Worker error (attempt %d): %s", consecutive_failures, error_msg)

            svc.telemetry.emit(
                WorkerError(
                    error=error_msg[-1000:],
                    error_type=type(exc).__name__,
                    job_id=job_id,
                    consecutive_failures=consecutive_failures,
                )
            )

            if consecutive_failures >= MAX_CONSECUTIVE_FAILURES:
                logger.critical("Too many consecutive failures (%d) — exiting", consecutive_failures)
                raise

            backoff = min(2**consecutive_failures, MAX_BACKOFF)
            logger.info("Retrying in %ds", backoff)
            await asyncio.sleep(backoff)


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    logging.getLogger("azure").setLevel(logging.WARNING)
    asyncio.run(run())


if __name__ == "__main__":
    main()
