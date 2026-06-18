"""Request handlers — pure functions taking Services, no globals, no framework.

Each function implements one API operation. The FastAPI endpoints in app.py
are thin wrappers that call these with the Services instance.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import UTC, datetime

from .context import Services
from .crypto import decrypt, encrypt
from .estimates import billable_units, estimate_seconds
from .hash import document_hash
from .mimetypes import is_archive_type, is_known_mime_type
from .protocols import (
    DEFAULT_RETENTION_SECONDS,
    Job,
    JobMeta,
    JobStatus,
    JobType,
    ResolveMisconfigured,
    ResolveRejected,
    UserContext,
)
from .quota import current_period_start
from .sanitize import content_disposition, sanitize_filename
from .telemetry import JobAccepted

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------


@dataclass
class AcceptResult:
    job_id: str
    estimated_seconds: int
    input_bytes: int = 0
    retention_seconds: int = DEFAULT_RETENTION_SECONDS

    @property
    def billable_units(self) -> int:
        return billable_units(self.input_bytes)


class Rejected(Exception):
    """Raised when a request is rejected (quota, auth, etc.)."""

    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


@dataclass
class PollResult:
    status: str  # processing | ok | error | expired
    status_code: int = 202
    body: dict | None = None
    headers: dict[str, str] | None = None


def _require_user(resolved) -> UserContext:
    """Extract UserContext from a ResolveResult, or raise Rejected / RuntimeError."""
    if resolved is None:
        raise Rejected(403, "Unknown subscription — no user mapping found")
    if isinstance(resolved, ResolveRejected):
        raise Rejected(resolved.status, resolved.reason)
    if isinstance(resolved, ResolveMisconfigured):
        raise RuntimeError(f"Account misconfigured: {resolved.reason}")
    return resolved


# ---------------------------------------------------------------------------
# POST /canonize
# ---------------------------------------------------------------------------


async def accept_canonize(
    file_bytes: bytes,
    filename: str,
    mime_type: str,
    sub_id: str,
    svc: Services,
) -> AcceptResult:
    """Accept a file for canonization. Returns job_id and estimate.

    Raises Rejected on auth failure, unknown user, or quota exceeded.
    """
    user = _require_user(await svc.users.resolve(sub_id))

    if is_archive_type(mime_type):
        raise Rejected(
            400,
            f"Archive files ({mime_type}) are not supported. "
            "Please extract the archive and submit each file individually.",
        )

    if not is_known_mime_type(mime_type):
        raise Rejected(400, f"Unsupported file type: {mime_type}")

    # Quota check + immediate reservation (period-scoped to billing anchor).
    # Pin the period now so the worker's refund-on-failure targets the same one.
    period_start = current_period_start(user.billing_anchor_day)
    rejection = await svc.quota.check(sub_id, len(file_bytes), user.billing_anchor_day)
    if rejection:
        raise Rejected(429, rejection)
    await svc.quota.record(sub_id, len(file_bytes), period_start, user.billing_anchor_day)

    doc_hash = document_hash(file_bytes)
    job = Job.create(
        sub_id=sub_id,
        mime_type=mime_type,
        filename=filename,
        job_type=JobType.CANONIZE,
    )

    # Sanitize and store
    safe_filename = sanitize_filename(filename)
    blob_prefix = f"{user.user_id}/{job.job_id}"

    encrypted_input = encrypt(file_bytes, user.encryption_key)
    await svc.blobs.put(f"{blob_prefix}/input.bin", encrypted_input)

    # Write job metadata
    now = datetime.now(UTC).isoformat()
    meta = JobMeta(
        user_id=user.user_id,
        job_id=job.job_id,
        sub_id=sub_id,
        job_type=JobType.CANONIZE,
        key_id=user.key_id,
        original_filename=safe_filename,
        mime_type=mime_type,
        input_bytes=len(file_bytes),
        input_hash=doc_hash,
        status=JobStatus.PROCESSING,
        period_start=period_start,
        created_at=now,
        price_per_unit=user.price_per_unit,
    )
    svc.jobs.create(meta)

    # Enqueue
    await svc.queue.enqueue(job)

    svc.telemetry.emit(
        JobAccepted(
            job_id=job.job_id,
            user_id=user.user_id,
            sub_id=sub_id,
            mime_type=mime_type,
            filename=safe_filename,
            input_bytes=len(file_bytes),
        )
    )

    return AcceptResult(
        job_id=job.job_id,
        estimated_seconds=estimate_seconds(mime_type, len(file_bytes)),
        input_bytes=len(file_bytes),
    )


# ---------------------------------------------------------------------------
# GET /result/{job_id}
# ---------------------------------------------------------------------------


async def poll_result(job_id: str, sub_id: str, svc: Services) -> PollResult:
    """Poll for a job result. Only the owning subscription sees its metadata."""
    result = await svc.queue.get_result(job_id)
    meta = svc.jobs.get(job_id)

    # Ownership: a non-owner (or guessed job_id) gets the same "processing"
    # response as an unknown job — existence is never confirmable.
    if meta is not None and meta.sub_id != sub_id:
        meta = None
        result = None

    if meta is None:
        if result is None:
            return PollResult(status="processing", status_code=202, body={"job_id": job_id, "status": "processing"})
    else:
        if meta.status == JobStatus.DELETED:
            return PollResult(
                status="expired",
                status_code=410,
                body={"job_id": job_id, "status": "expired", "detail": "Result deleted"},
            )

        if meta.retention_expires:
            expires = datetime.fromisoformat(meta.retention_expires)
            if datetime.now(UTC) > expires:
                return PollResult(
                    status="expired",
                    status_code=410,
                    body={"job_id": job_id, "status": "expired", "detail": "Result retention expired"},
                )

    if result is None:
        return PollResult(status="processing", status_code=202, body={"job_id": job_id, "status": "processing"})

    if result.status == "error":
        return PollResult(
            status="error",
            status_code=500,
            body={"job_id": job_id, "status": "error", "detail": result.detail},
        )

    # Success — return artefact manifest from metadata
    if not meta:
        return PollResult(
            status="error",
            status_code=500,
            body={"job_id": job_id, "status": "error", "detail": "Missing job metadata"},
        )

    body: dict = {
        "job_id": job_id,
        "status": "ok",
        "metadata": {
            "detected_type": meta.mime_type,
            "input_bytes": meta.input_bytes,
            "input_hash": meta.input_hash,
        },
    }

    headers: dict[str, str] = {
        "X-Input-Size-Bytes": str(meta.input_bytes),
        "X-Document-Hash": meta.input_hash,
    }

    if meta.artefacts:
        body["artefacts"] = json.loads(meta.artefacts)

    if meta.retention_expires:
        body["expires_at"] = meta.retention_expires

    if meta.original_filename:
        headers["Content-Disposition"] = content_disposition(meta.original_filename + ".md")

    return PollResult(status="ok", status_code=200, body=body, headers=headers)


# ---------------------------------------------------------------------------
# DELETE /result/{job_id}
# ---------------------------------------------------------------------------


async def delete_result(job_id: str, sub_id: str, svc: Services) -> bool:
    """Delete a job's blobs. Returns True if found and deleted, False if not found.

    Raises Rejected if the job doesn't belong to the requesting user.
    """
    user = _require_user(await svc.users.resolve(sub_id))

    meta = svc.jobs.get(job_id)
    if meta is None:
        return False

    if meta.user_id != user.user_id:
        raise Rejected(404, "Job not found")  # 404 not 403: don't confirm a job exists to a non-owner

    if meta.status == JobStatus.DELETED:
        return False

    blob_prefix = f"{meta.user_id}/{job_id}"
    await svc.blobs.delete_prefix(f"{blob_prefix}/")
    svc.jobs.mark_deleted(job_id)

    return True


# ---------------------------------------------------------------------------
# GET /v1/canonize/{job_id}/artefacts/{name}
# ---------------------------------------------------------------------------


@dataclass
class ArtifactResult:
    data: bytes
    filename: str
    content_type: str


async def download_artefact(
    job_id: str,
    sub_id: str,
    name: str,
    svc: Services,
) -> ArtifactResult:
    """Download a pipeline artefact by name. Returns decrypted bytes.

    Raises Rejected on auth failure, wrong user, expired, missing, or unknown name.
    """
    user = _require_user(await svc.users.resolve(sub_id))

    meta = svc.jobs.get(job_id)
    if meta is None:
        raise Rejected(404, "Job not found")

    if meta.user_id != user.user_id:
        raise Rejected(404, "Job not found")  # 404 not 403: don't confirm a job exists to a non-owner

    if meta.status == JobStatus.DELETED:
        raise Rejected(410, "Job deleted")

    if meta.retention_expires:
        if datetime.now(UTC) > datetime.fromisoformat(meta.retention_expires):
            raise Rejected(410, "Job expired")

    # Look up in manifest
    if not meta.artefacts:
        raise Rejected(404, "No artefacts available for this job")

    manifest: list[dict] = json.loads(meta.artefacts)
    entry = next((a for a in manifest if a["name"] == name), None)
    if entry is None:
        available = [a["name"] for a in manifest]
        raise Rejected(404, f"Unknown artefact: {name}. Available: {available}")

    blob_prefix = f"{meta.user_id}/{job_id}"
    encrypted = await svc.blobs.get(f"{blob_prefix}/artefacts/{name}.bin")
    if encrypted is None:
        raise Rejected(404, "Artefact blob not found")

    decrypted = decrypt(encrypted, user.encryption_key)
    return ArtifactResult(data=decrypted, filename=name, content_type=entry["mime_type"])
