"""Worker processing for canonize jobs — pure function taking Services, no globals.

Called by the dispatcher in process.py.
"""

import json
import logging
import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from .artefacts import ArtefactStore
from .context import Services
from .convert import canonize
from .crypto import decrypt
from .errors import MalformedInput, ServiceNotConfigured, UnsupportedFormat
from .hash import document_hash
from .protocols import DEFAULT_RETENTION_SECONDS, Job, JobResult, JobStatus, UserContext
from .services.retry import PermanentUpstreamError, TransientUpstreamError
from .telemetry import JobCompleted, ServiceStep, set_telemetry_context
from .tracing import Step, Trace
from .types import SubmittedFile

logger = logging.getLogger(__name__)


@dataclass
class ProcessResult:
    """Outcome of processing a single job."""

    job_result: JobResult
    file_size: int = 0
    doc_hash: str = ""
    error_category: str = ""


async def process_canonize(job: Job, user: UserContext, svc: Services) -> ProcessResult:
    """Process a canonize job. Pure function — all dependencies via svc and user."""
    processing_start = time.monotonic()
    set_telemetry_context(svc.telemetry, job.job_id, user.user_id, mime_type=job.mime_type)
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
    artefacts = ArtefactStore(blob_prefix, user.encryption_key, svc.blobs)

    try:
        submitted = SubmittedFile(data=file_bytes, mime_type=job.mime_type, filename=job.filename)
        markdown = await canonize(submitted, deadline, trace, svc, artefacts)
        trace.finish()
        steps = trace.to_steps()

        # Store markdown as artefact (if non-empty — image-only inputs produce no markdown)
        if markdown:
            await artefacts.put("markdown", markdown.encode(), "text/markdown", label="Extracted text")

        # Update job metadata
        now = datetime.now(UTC)
        meta = svc.jobs.get(job.job_id)
        if meta:
            meta.status = JobStatus.OK
            meta.completed_at = now.isoformat()
            meta.retention_expires = (now + timedelta(seconds=DEFAULT_RETENTION_SECONDS)).isoformat()
            meta.steps = json.dumps(trace.to_dict())
            if artefacts.manifest:
                meta.artefacts = artefacts.manifest_json()
            svc.jobs.update(meta)

        proc = ProcessResult(JobResult(job_id=job.job_id, status="ok", status_code=200), file_size, doc_hash_val)
        _emit_telemetry(svc, job, user, proc, steps, processing_start)
        return proc

    except Exception as e:
        if isinstance(e, (UnsupportedFormat, MalformedInput)):
            status_code, category, steps = 400, "permanent", []
        elif isinstance(e, ServiceNotConfigured):
            status_code, category, steps = 422, "permanent", []
        else:
            status_code, category = 500, _error_category(e)
            steps = trace.to_steps()
            logger.error("Job %s failed (%s): %s", job.job_id, category, e)

        _mark_error(svc, job.job_id, str(e), category, trace)
        proc = ProcessResult(
            JobResult(job_id=job.job_id, status="error", detail=str(e), status_code=status_code),
            file_size,
            doc_hash_val,
            error_category=category,
        )
        _emit_telemetry(svc, job, user, proc, steps, processing_start)
        return proc


def _emit_telemetry(
    svc: Services,
    job: Job,
    user: UserContext,
    proc: ProcessResult,
    steps: list[Step],
    processing_start: float,
) -> None:
    """Build and emit a JobCompleted event."""
    now = time.monotonic()
    processing_ms = (now - processing_start) * 1000

    meta = svc.jobs.get(job.job_id)
    queue_wait_ms = 0.0
    if meta and meta.created_at:
        try:
            created = datetime.fromisoformat(meta.created_at)
            total_ms = (datetime.now(UTC) - created).total_seconds() * 1000
            queue_wait_ms = max(total_ms - processing_ms, 0.0)
        except (ValueError, TypeError):
            total_ms = processing_ms
    else:
        total_ms = processing_ms

    services = [
        ServiceStep(
            name=s.service,
            duration_ms=s.duration_ms,
            retries=s.total_retries,
            retry_delay_ms=s.total_retry_delay_ms,
        )
        for s in steps
    ]

    event = JobCompleted(
        job_id=job.job_id,
        user_id=user.user_id,
        sub_id=job.sub_id,
        status=proc.job_result.status,
        error=proc.job_result.detail if proc.job_result.status == "error" else "",
        mime_type=job.mime_type,
        filename=job.filename,
        input_bytes=proc.file_size,
        queue_wait_ms=round(queue_wait_ms, 1),
        processing_ms=round(processing_ms, 1),
        total_ms=round(total_ms, 1),
        services=services,
    )
    svc.telemetry.emit(event)


def _error_category(e: Exception) -> str:
    """Classify an exception as transient, permanent, or internal."""
    if isinstance(e, TransientUpstreamError):
        return "transient"
    if isinstance(e, PermanentUpstreamError):
        return "permanent"
    return "internal"


def _mark_error(svc: Services, job_id: str, detail: str, category: str, trace: Trace | None = None) -> None:
    """Update job metadata to error status."""
    meta = svc.jobs.get(job_id)
    if meta:
        meta.status = JobStatus.ERROR
        meta.detail = f"[{category}] {detail}"
        meta.completed_at = datetime.now(UTC).isoformat()
        if trace:
            trace.finish()
            meta.steps = json.dumps(trace.to_dict())
        svc.jobs.update(meta)
