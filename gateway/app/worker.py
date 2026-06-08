"""Worker process — thin wiring layer.

Constructs Services at startup, main loop calls dispatch_job.
No business logic here.
"""

import asyncio
import logging
import os
import traceback

from .azure_clients import get_blob_service, get_table_service
from .blob_azure import AzureBlobStore
from .context import Services
from .jobs_table import TableJobStore
from .process import ProcessResult, dispatch_job
from .protocols import Job, JobStatus, UserContext
from .queue import RedisQueue
from .quota import QuotaService
from .redis_client import get_redis
from .services.captioning import OpenAIImageCaptioner
from .services.docling import DoclingPdfExtractor
from .services.libreoffice import GotenbergOleConverter
from .services.markitdown import MarkItDownExtractor
from .services.thumbnails import PyMuPdfRenderer
from .sweep import run_sweep_loop
from .telemetry import JobReclaimed, JobSkippedIdempotent, PostHogEmitter, WorkerError
from .user_resolver import TableUserResolver

logger = logging.getLogger(__name__)

MAX_BACKOFF = 60
MAX_CONSECUTIVE_FAILURES = 20
MAX_CONCURRENT_JOBS = int(os.environ.get("WORKER_CONCURRENCY", "3"))


def on_job_error(job: Job, proc: ProcessResult) -> None:
    """Hook called when a job fails. Currently logs; future: email user."""
    logger.info("on_job_error: job %s category=%s detail=%s", job.job_id, proc.error_category, proc.job_result.detail)


async def _handle_job(job: Job, svc: Services, sem: asyncio.Semaphore) -> None:
    """Process a single job in its own task. Releases semaphore when done."""
    try:
        if job.reclaimed:
            logger.info("Reclaimed stale job %s via XAUTOCLAIM", job.job_id)
            svc.telemetry.emit(JobReclaimed(job_id=job.job_id))

        logger.info("Processing job %s (%s, %s)", job.job_id, job.mime_type, job.filename)

        # Idempotency guard: skip jobs already in a terminal state
        meta = svc.jobs.get(job.job_id)
        if meta and meta.status in (JobStatus.OK, JobStatus.DELETED):
            logger.info("Job %s already %s — skipping", job.job_id, meta.status)
            svc.telemetry.emit(JobSkippedIdempotent(job_id=job.job_id, current_status=meta.status))
            await svc.queue.acknowledge(job)
            return

        resolved = await svc.users.resolve(job.sub_id)
        if not isinstance(resolved, UserContext):
            logger.error("Job %s has unmapped subscription %s — skipping", job.job_id, job.sub_id)
            svc.telemetry.emit(
                WorkerError(
                    error=f"Unresolvable subscription: {resolved}",
                    error_type="resolve_failed",
                    job_id=job.job_id,
                )
            )
            await svc.queue.acknowledge(job)
            return
        user = resolved

        beat = svc.queue.heartbeat(job)
        try:
            proc = await dispatch_job(job, user, svc)
        finally:
            beat.cancel()
        await svc.queue.store_result(job.job_id, proc.job_result)
        await svc.queue.acknowledge(job)

        # On failure: refund quota and call error hook
        if proc.job_result.status == "error" and job.sub_id and proc.file_size > 0:
            await svc.quota.refund(job.sub_id, proc.file_size)
            logger.info("Job %s failed — refunded %d bytes", job.job_id, proc.file_size)
            on_job_error(job, proc)

        logger.info("Job %s completed with status %s (acked)", job.job_id, proc.job_result.status)

    except Exception as exc:
        error_msg = traceback.format_exc()
        logger.error("Job %s crashed: %s", job.job_id, error_msg)
        svc.telemetry.emit(
            WorkerError(
                error=error_msg[-1000:],
                error_type=type(exc).__name__,
                job_id=job.job_id,
            )
        )
    finally:
        sem.release()


async def run():
    """Main worker loop — dequeue and process jobs concurrently."""
    logger.info("Worker starting (concurrency=%d)", MAX_CONCURRENT_JOBS)
    r = await get_redis()
    if r is None:
        raise RuntimeError("REDIS_URL is required for the worker")

    table_svc = get_table_service()
    blob_svc = get_blob_service()

    queue = RedisQueue(r)
    svc = Services(
        blobs=AzureBlobStore(blob_svc),
        jobs=TableJobStore(table_svc),
        users=TableUserResolver(r, table_svc),  # type: ignore[arg-type]  # redis stubs return bytes|str; we use decode_responses=True
        queue=queue,
        quota=QuotaService(r, table_service=table_svc),  # type: ignore[arg-type]
        telemetry=PostHogEmitter(),
        captioner=OpenAIImageCaptioner(),
        pdf_extractor=DoclingPdfExtractor(),
        ole_converter=GotenbergOleConverter(),
        ooxml_extractor=MarkItDownExtractor(),
        page_renderer=PyMuPdfRenderer(),
    )
    await queue.ensure_group()
    asyncio.create_task(run_sweep_loop(svc))
    logger.info("Worker ready, waiting for jobs")

    sem = asyncio.Semaphore(MAX_CONCURRENT_JOBS)
    consecutive_failures = 0

    while True:
        try:
            await sem.acquire()
            job = await svc.queue.dequeue(timeout=5000)
            if job is None:
                sem.release()
                consecutive_failures = 0
                continue

            consecutive_failures = 0
            asyncio.create_task(_handle_job(job, svc, sem))

        except Exception as exc:
            sem.release()
            consecutive_failures += 1
            error_msg = traceback.format_exc()
            logger.error("Worker error (attempt %d): %s", consecutive_failures, error_msg)

            svc.telemetry.emit(
                WorkerError(
                    error=error_msg[-1000:],
                    error_type=type(exc).__name__,
                    job_id="",
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
