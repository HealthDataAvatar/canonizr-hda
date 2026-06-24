"""Worker process — thin wiring layer.

Constructs Services at startup, main loop calls dispatch_job.
No business logic here.
"""

import asyncio
import logging
import os
import traceback
from datetime import UTC, datetime

from .azure_clients import get_blob_service, get_table_service
from .blob_azure import AzureBlobStore
from .context import Services
from .jobs_table import TableJobStore
from .process import dispatch_job
from .protocols import Job, JobResult, JobStatus, UserContext
from .queue import RedisQueue
from .quota import QuotaService, current_period_start
from .redis_client import get_redis
from .services.libreoffice import GotenbergOleConverter
from .services.liteparse import LiteParsePdfTextExtractor
from .services.markitdown import MarkItDownExtractor
from .services.pdfium_renderer import PdfiumPageRenderer
from .services.pikepdf_images import PikepdfImageExtractor
from .sweep import run_sweep_loop
from .telemetry import JobReclaimed, JobSkippedIdempotent, PostHogEmitter, WorkerError
from .user_resolver import TableUserResolver

logger = logging.getLogger(__name__)

MAX_BACKOFF = 60
MAX_CONSECUTIVE_FAILURES = 20
MAX_CONCURRENT_JOBS = int(os.environ.get("WORKER_CONCURRENCY", "3"))
MAX_DELIVERIES = int(os.environ.get("QUEUE_MAX_DELIVERIES", "5"))


async def _dead_letter(job: Job, svc: Services) -> None:
    """Abandon a poison job: store an error result, ack it, and mark the meta failed
    so the sweep won't re-enqueue it. Called when a job is redelivered too many times."""
    logger.error("Job %s exceeded %d deliveries — abandoning (poison pill)", job.job_id, MAX_DELIVERIES)
    detail = "Job failed repeatedly and was abandoned"
    await svc.queue.store_result(
        job.job_id, JobResult(job_id=job.job_id, status="error", detail=detail, status_code=500)
    )
    await svc.queue.acknowledge(job)
    meta = svc.jobs.get(job.job_id)
    if meta and meta.status not in (JobStatus.OK, JobStatus.DELETED):
        meta.status = JobStatus.ERROR
        meta.detail = f"[poison] {detail}"
        meta.completed_at = datetime.now(UTC).isoformat()
        svc.jobs.update(meta)
    svc.telemetry.emit(WorkerError(error="poison job abandoned", error_type="poison", job_id=job.job_id))


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

        # Poison-pill guard: a job redelivered too many times reliably crashes the
        # worker mid-processing. Abandon it as a failure instead of looping forever.
        if job.reclaimed and job.delivery_count > MAX_DELIVERIES:
            await _dead_letter(job, svc)
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

        # On failure: refund the exact quota that was charged at accept. Key off
        # the recorded JobMeta (input_bytes + period_start), not proc.file_size —
        # early failures (bad decrypt, missing input) report file_size=0 yet were
        # still charged, and the period must match the one charged.
        if proc.job_result.status == "error" and job.sub_id:
            meta = svc.jobs.get(job.job_id)
            if meta and meta.input_bytes > 0:
                ps = meta.period_start or current_period_start(user.billing_anchor_day)
                await svc.quota.refund(job.sub_id, meta.user_id, meta.input_bytes, ps, user.billing_anchor_day)
                logger.info("Job %s failed — refunded %d bytes", job.job_id, meta.input_bytes)
            logger.info("Job %s failed: category=%s detail=%s", job.job_id, proc.error_category, proc.job_result.detail)

        logger.info("Job %s completed with status %s (acked)", job.job_id, proc.job_result.status)

    except Exception as exc:
        error_msg = traceback.format_exc()
        logger.error("Job %s crashed: %s", job.job_id, error_msg)
        # Don't ack and don't change status: a crash here (resolve/heartbeat/dispatch/
        # store) may be transient, so leave the job PROCESSING and unacked for
        # redelivery. It only goes terminal (ERROR [poison]) once redeliveries are
        # exhausted — until then PROCESSING is the honest state.
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
        pdf_text_extractor=LiteParsePdfTextExtractor(),
        pdf_image_extractor=PikepdfImageExtractor(),
        ole_converter=GotenbergOleConverter(),
        ooxml_extractor=MarkItDownExtractor(),
        page_renderer=PdfiumPageRenderer(),
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
