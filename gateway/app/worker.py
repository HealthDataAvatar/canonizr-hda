"""Worker process — dequeues jobs from Redis Stream and runs the convert() pipeline.

Uses consumer groups for at-least-once delivery:
- XREADGROUP to claim jobs
- XACK after result is stored
- If worker crashes before ACK, another worker reclaims via XAUTOCLAIM
"""

import asyncio
import json
import logging
import time
from dataclasses import dataclass

from . import blobstore
from .convert import ServiceNotConfigured, UnsupportedFormat, convert
from .crypto import ENCRYPTION_KEY, decrypt, encrypt
from .hash import document_hash
from .queue import JobResult, acknowledge, delete_dedupe, dequeue, ensure_group, store_result
from .quota import QuotaService, get_redis
from .tracing import Trace

logger = logging.getLogger(__name__)


@dataclass
class ProcessResult:
    """Internal result from process_job — includes data needed for refund/dedupe cleanup."""

    job_result: JobResult
    file_size: int = 0
    doc_hash: str = ""


async def process_job(job, key: bytes) -> ProcessResult:
    """Process a single job and return a ProcessResult."""
    try:
        encrypted_input = await blobstore.get(job.input_blob_key)
        if encrypted_input is None:
            return ProcessResult(
                JobResult(job_id=job.job_id, status="error", error_detail="Input blob not found", status_code=500)
            )
        file_bytes = decrypt(encrypted_input, key)
    except Exception as e:
        logger.error("Failed to read/decrypt input for job %s: %s", job.job_id, e)
        return ProcessResult(
            JobResult(job_id=job.job_id, status="error", error_detail="Decryption failed", status_code=500)
        )

    file_size = len(file_bytes)
    doc_hash = document_hash(file_bytes)
    deadline = time.monotonic() + job.deadline_seconds
    trace = Trace("worker", file_size_bytes=file_size, mime_type=job.mime_type, filename=job.filename)

    try:
        result = await convert(file_bytes, job.mime_type, job.filename, deadline, trace)
        trace.finish()
        result.detected_type = job.mime_type
        result.input_bytes = file_size
        result.input_hash = doc_hash

        payload_json = json.dumps(result.to_dict(verbose=job.verbose))
        encrypted_output = encrypt(payload_json.encode(), key)
        await blobstore.put(job.output_blob_key, encrypted_output)

        # Clean up input blob
        await blobstore.delete(job.input_blob_key)

        return ProcessResult(JobResult(job_id=job.job_id, status="ok", status_code=200), file_size, doc_hash)

    except UnsupportedFormat as e:
        await blobstore.delete(job.input_blob_key)
        return ProcessResult(
            JobResult(job_id=job.job_id, status="error", error_detail=str(e), status_code=400), file_size, doc_hash
        )

    except ServiceNotConfigured as e:
        await blobstore.delete(job.input_blob_key)
        return ProcessResult(
            JobResult(job_id=job.job_id, status="error", error_detail=str(e), status_code=422), file_size, doc_hash
        )

    except Exception as e:
        logger.error("Job %s failed: %s", job.job_id, e)
        await blobstore.delete(job.input_blob_key)
        return ProcessResult(
            JobResult(job_id=job.job_id, status="error", error_detail="Internal processing error", status_code=500),
            file_size,
            doc_hash,
        )


async def run():
    """Main worker loop — dequeue and process jobs forever."""
    logger.info("Worker starting")
    r = await get_redis()
    if r is None:
        raise RuntimeError("REDIS_URL is required for the worker")

    key = ENCRYPTION_KEY
    if key is None:
        raise RuntimeError("ENCRYPTION_KEY is required for the worker")

    quota_svc = QuotaService(r)
    await ensure_group(r)
    logger.info("Worker ready, waiting for jobs")

    while True:
        job = await dequeue(r, timeout=5000)
        if job is None:
            continue

        logger.info("Processing job %s (%s, %s)", job.job_id, job.mime_type, job.filename)
        proc = await process_job(job, key)
        await store_result(r, job.job_id, proc.job_result)
        await acknowledge(r, job)

        # On failure: refund quota and clear dedupe key so user can retry
        if proc.job_result.status == "error" and job.sub_id and proc.file_size > 0:
            await quota_svc.refund(job.sub_id, proc.file_size)
            if proc.doc_hash:
                await delete_dedupe(r, job.sub_id, proc.doc_hash)
            logger.info("Job %s failed — refunded %d bytes, cleared dedupe", job.job_id, proc.file_size)

        logger.info("Job %s completed with status %s (acked)", job.job_id, proc.job_result.status)


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    asyncio.run(run())


if __name__ == "__main__":
    main()
