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
from .estimates import estimate_seconds
from .hash import document_hash
from .mimetypes import is_archive_type, is_known_mime_type
from .protocols import Job, JobMeta, JobStatus, ResolveMisconfigured, ResolveRejected, UserContext
from .sanitize import content_disposition, sanitize_filename
from .telemetry import JobAccepted

logger = logging.getLogger(__name__)

DEFAULT_RETENTION_SECONDS = 86_400  # 24 hours


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
        """Number of 100KB units (rounded up, minimum 1)."""
        return max(1, -(-self.input_bytes // 100_000))


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
# POST /convert
# ---------------------------------------------------------------------------


async def accept_job(
    file_bytes: bytes,
    filename: str,
    mime_type: str,
    sub_id: str,
    svc: Services,
) -> AcceptResult:
    """Accept a file for conversion. Returns job_id and estimate.

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

    doc_hash = document_hash(file_bytes)

    # Quota check + immediate reservation
    rejection = await svc.quota.check(sub_id, len(file_bytes))
    if rejection:
        raise Rejected(429, rejection)
    await svc.quota.record(sub_id, len(file_bytes))

    # Create job (ID prefixed with YYYY-MM for month-scoped queries)
    job = Job.create(
        sub_id=sub_id,
        mime_type=mime_type,
        filename=filename,
        deadline_seconds=300.0,
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
        key_name=user.key_name,
        original_filename=safe_filename,
        mime_type=mime_type,
        input_bytes=len(file_bytes),
        input_hash=doc_hash,
        status=JobStatus.PROCESSING,
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


async def poll_result(job_id: str, svc: Services) -> PollResult:
    """Poll for a job result."""
    result = await svc.queue.get_result(job_id)
    meta = svc.jobs.get_by_job_id(job_id)

    if meta is None:
        if result is None:
            return PollResult(status="processing", status_code=202, body={"job_id": job_id, "status": "processing"})
        meta_user_id = ""
    else:
        meta_user_id = meta.user_id

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

    # Success — decrypt and return output
    blob_prefix = f"{meta_user_id}/{job_id}" if meta_user_id else job_id
    encrypted_output = await svc.blobs.get(f"{blob_prefix}/output.bin")
    if encrypted_output is None:
        return PollResult(
            status="expired",
            status_code=410,
            body={"job_id": job_id, "status": "expired", "detail": "Result blob not found"},
        )

    if meta and meta.sub_id:
        user = await svc.users.resolve(meta.sub_id)
        if not isinstance(user, UserContext):
            return PollResult(
                status="error",
                status_code=500,
                body={"job_id": job_id, "status": "error", "detail": "User key not found"},
            )
        payload = json.loads(decrypt(encrypted_output, user.encryption_key))
    else:
        return PollResult(
            status="error",
            status_code=500,
            body={"job_id": job_id, "status": "error", "detail": "Missing user context"},
        )

    resp_meta = payload.get("metadata", {})
    captioning = resp_meta.get("captioning", {})
    headers = {
        "X-Input-Size-Bytes": str(resp_meta.get("input_bytes", 0)),
        "X-Document-Hash": resp_meta.get("input_hash", ""),
        "X-Processing-Time-Ms": str(round(resp_meta.get("processing_time_ms", 0))),
        "X-Processing-Pipeline": ",".join(resp_meta.get("actions", [])),
        "X-Images-Captioned": str(captioning.get("images_captioned", 0)),
    }

    if meta and meta.original_filename:
        md_filename = meta.original_filename + ".md"
        headers["Content-Disposition"] = content_disposition(md_filename)

    if meta and meta.retention_expires:
        payload["expires_at"] = meta.retention_expires

    if meta and meta.artefacts:
        payload["artefacts"] = json.loads(meta.artefacts)

    return PollResult(status="ok", status_code=200, body=payload, headers=headers)


# ---------------------------------------------------------------------------
# DELETE /result/{job_id}
# ---------------------------------------------------------------------------


async def delete_result(job_id: str, sub_id: str, svc: Services) -> bool:
    """Delete a job's blobs. Returns True if found and deleted, False if not found.

    Raises Rejected if the job doesn't belong to the requesting user.
    """
    user = _require_user(await svc.users.resolve(sub_id))

    meta = svc.jobs.get_by_job_id(job_id)
    if meta is None:
        return False

    if meta.user_id != user.user_id:
        raise Rejected(403, "Job does not belong to this user")

    if meta.status == JobStatus.DELETED:
        return False

    blob_prefix = f"{meta.user_id}/{job_id}"
    await svc.blobs.delete_prefix(f"{blob_prefix}/")
    svc.jobs.mark_deleted(meta.user_id, job_id)

    return True


# ---------------------------------------------------------------------------
# GET /v1/jobs/{job_id}/output and /v1/jobs/{job_id}/input
# ---------------------------------------------------------------------------


@dataclass
class ArtifactResult:
    data: bytes
    filename: str
    content_type: str


async def download_artifact(
    job_id: str,
    sub_id: str,
    artifact: str,
    svc: Services,
) -> ArtifactResult:
    """Download a job artifact (input or output). Returns decrypted bytes.

    Raises Rejected on auth failure, wrong user, expired, or missing blob.
    """
    user = _require_user(await svc.users.resolve(sub_id))

    meta = svc.jobs.get_by_job_id(job_id)
    if meta is None:
        raise Rejected(404, "Job not found")

    if meta.user_id != user.user_id:
        raise Rejected(403, "Job does not belong to this user")

    if meta.status == JobStatus.DELETED:
        raise Rejected(410, "Job deleted")

    if meta.retention_expires:
        if datetime.now(UTC) > datetime.fromisoformat(meta.retention_expires):
            raise Rejected(410, "Job expired")

    blob_prefix = f"{meta.user_id}/{job_id}"

    if artifact == "output":
        encrypted = await svc.blobs.get(f"{blob_prefix}/output.bin")
        if encrypted is None:
            raise Rejected(404, "Output not available")
        decrypted = decrypt(encrypted, user.encryption_key)
        payload = json.loads(decrypted)
        markdown = payload.get("markdown", "")
        filename = f"{meta.original_filename}.md"
        return ArtifactResult(data=markdown.encode(), filename=filename, content_type="text/markdown; charset=utf-8")

    elif artifact == "input":
        encrypted = await svc.blobs.get(f"{blob_prefix}/input.bin")
        if encrypted is None:
            raise Rejected(404, "Input not available")
        decrypted = decrypt(encrypted, user.encryption_key)
        return ArtifactResult(
            data=decrypted, filename=meta.original_filename, content_type=meta.mime_type or "application/octet-stream"
        )

    else:
        raise Rejected(400, f"Unknown artifact: {artifact}")


# ---------------------------------------------------------------------------
# GET /v1/jobs/{job_id}/artefacts/{name}
# ---------------------------------------------------------------------------


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

    meta = svc.jobs.get_by_job_id(job_id)
    if meta is None:
        raise Rejected(404, "Job not found")

    if meta.user_id != user.user_id:
        raise Rejected(403, "Job does not belong to this user")

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
