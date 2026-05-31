"""Worker job processing — pure function taking Services, no globals.

Called by worker.py's main loop with a WorkerContext.
"""

import json
import logging
import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from .context import Services
from .convert import ServiceNotConfigured, UnsupportedFormat, convert
from .crypto import decrypt, encrypt
from .hash import document_hash
from .protocols import Job, JobResult, JobStatus, UserContext
from .tracing import Trace

logger = logging.getLogger(__name__)

DEFAULT_RETENTION_SECONDS = 86_400  # 24 hours


@dataclass
class ProcessResult:
    """Outcome of processing a single job."""

    job_result: JobResult
    file_size: int = 0
    doc_hash: str = ""


async def process_job(job: Job, user: UserContext, svc: Services) -> ProcessResult:
    """Process a single job. Pure function — all dependencies via svc and user."""
    blob_prefix = f"{user.user_id}/{job.job_id}"

    # Read and decrypt input
    try:
        encrypted_input = await svc.blobs.get(f"{blob_prefix}/input.bin")
        if encrypted_input is None:
            return ProcessResult(
                JobResult(job_id=job.job_id, status="error", detail="Input blob not found", status_code=500)
            )
        file_bytes = decrypt(encrypted_input, user.encryption_key)
    except Exception as e:
        logger.error("Failed to read/decrypt input for job %s: %s", job.job_id, e)
        return ProcessResult(JobResult(job_id=job.job_id, status="error", detail="Decryption failed", status_code=500))

    file_size = len(file_bytes)
    doc_hash_val = document_hash(file_bytes)
    deadline = time.monotonic() + job.deadline_seconds
    trace = Trace("worker", file_size_bytes=file_size, mime_type=job.mime_type, filename=job.filename)

    try:
        result = await convert(file_bytes, job.mime_type, job.filename, deadline, trace)
        trace.finish()
        steps = trace.to_steps()
        result.detected_type = job.mime_type
        result.input_bytes = file_size
        result.input_hash = doc_hash_val

        # Encrypt output with per-user key
        payload_json = json.dumps(result.to_dict(verbose=job.verbose))
        encrypted_output = encrypt(payload_json.encode(), user.encryption_key)
        await svc.blobs.put(f"{blob_prefix}/output.bin", encrypted_output)

        # Update job metadata
        now = datetime.now(UTC)
        meta = svc.jobs.get(user.user_id, job.job_id)
        if meta:
            meta.status = JobStatus.OK
            meta.completed_at = now.isoformat()
            meta.retention_expires = (now + timedelta(seconds=DEFAULT_RETENTION_SECONDS)).isoformat()
            meta.steps = json.dumps(steps) if steps else ""
            svc.jobs.update(meta)

        return ProcessResult(JobResult(job_id=job.job_id, status="ok", status_code=200), file_size, doc_hash_val)

    except UnsupportedFormat as e:
        _mark_error(svc, user.user_id, job.job_id, str(e))
        return ProcessResult(
            JobResult(job_id=job.job_id, status="error", detail=str(e), status_code=400), file_size, doc_hash_val
        )

    except ServiceNotConfigured as e:
        _mark_error(svc, user.user_id, job.job_id, str(e))
        return ProcessResult(
            JobResult(job_id=job.job_id, status="error", detail=str(e), status_code=422), file_size, doc_hash_val
        )

    except Exception as e:
        logger.error("Job %s failed: %s", job.job_id, e)
        _mark_error(svc, user.user_id, job.job_id, "Internal processing error")
        return ProcessResult(
            JobResult(job_id=job.job_id, status="error", detail="Internal processing error", status_code=500),
            file_size,
            doc_hash_val,
        )


def _mark_error(svc: Services, user_id: str, job_id: str, detail: str) -> None:
    """Update job metadata to error status."""
    meta = svc.jobs.get(user_id, job_id)
    if meta:
        meta.status = JobStatus.ERROR
        meta.detail = detail
        meta.completed_at = datetime.now(UTC).isoformat()
        svc.jobs.update(meta)
