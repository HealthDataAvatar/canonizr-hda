import json
import logging
import os
from io import BytesIO

import magic
from fastapi import FastAPI, File, Header, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from . import blobstore, quota
from .crypto import decrypt, encrypt
from .estimates import estimate_seconds
from .hash import document_hash
from .queue import Job, check_dedupe, enqueue, ensure_group, get_result, set_dedupe
from .quota import QuotaService

logger = logging.getLogger(__name__)


def _billing_headers(payload: dict) -> dict[str, str]:
    """Extract billing metadata from the response payload as HTTP headers."""
    meta = payload.get("metadata", {})
    captioning = meta.get("captioning", {})
    return {
        "X-Input-Size-Bytes": str(meta.get("input_bytes", 0)),
        "X-Document-Hash": meta.get("input_hash", ""),
        "X-Processing-Time-Ms": str(round(meta.get("processing_time_ms", 0))),
        "X-Processing-Pipeline": ",".join(meta.get("actions", [])),
        "X-Images-Captioned": str(captioning.get("images_captioned", 0)),
        "X-Captioning-Prompt-Tokens": str(captioning.get("prompt_tokens", 0)),
        "X-Captioning-Completion-Tokens": str(captioning.get("completion_tokens", 0)),
    }


app = FastAPI()

DEBUG_MODE = os.environ.get("DEBUG", "").lower() in ("1", "true", "yes")
CORS_ORIGINS = [o for o in os.environ.get("CORS_ORIGINS", "").split(",") if o]
MAX_FILE_SIZE = int(os.environ.get("MAX_FILE_SIZE_MB", "50")) * 1024 * 1024
REQUEST_TIMEOUT = float(os.environ.get("REQUEST_TIMEOUT", "300.0"))

SANITISED_MESSAGES = {
    429: "Rate limit exceeded",
    500: "Internal processing error",
    502: "Upstream service error",
    504: "Upstream service timeout",
}

if CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ORIGINS,
        allow_methods=["*"],
        allow_headers=["*"],
    )


@app.exception_handler(HTTPException)
async def sanitise_errors(request: Request, exc: HTTPException):
    if DEBUG_MODE:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    logger.error("HTTP %d: %s", exc.status_code, exc.detail)
    safe_message = SANITISED_MESSAGES.get(exc.status_code, exc.detail)
    return JSONResponse(status_code=exc.status_code, content={"detail": safe_message})


ECHO_HEADERS = {"x-subscription-id", "x-org-id", "x-request-id"}


async def _read_file(file: UploadFile) -> bytes:
    content = BytesIO()
    size = 0
    while True:
        chunk = await file.read(1024 * 1024)
        if not chunk:
            break
        size += len(chunk)
        if size > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"File too large (max {MAX_FILE_SIZE // (1024 * 1024)}MB)",
            )
        content.write(chunk)
    content.seek(0)
    return content.read()


_quota: QuotaService | None = None


async def _get_redis():
    r = await quota.get_redis()
    if r is None:
        raise HTTPException(status_code=503, detail="Service unavailable")
    return r


def _accept_response(job_id: str, estimated_seconds: int) -> JSONResponse:
    """Standard 202 response for accepted jobs."""
    return JSONResponse(
        status_code=202,
        content={
            "job_id": job_id,
            "status": "processing",
            "poll_url": f"/result/{job_id}",
            "estimated_seconds": estimated_seconds,
        },
        headers={
            "Location": f"/result/{job_id}",
            "Retry-After": str(estimated_seconds),
        },
    )


@app.post("/convert")
async def convert_document(
    request: Request,
    file: UploadFile = File(...),
    verbose: bool = Query(False),
    accept: str = Header("application/json"),
):
    file_bytes = await _read_file(file)
    sub_id = request.headers.get("x-subscription-id", "")

    # Trust client MIME type if provided and specific; fall back to magic detection
    client_mime = file.content_type or ""
    if client_mime and client_mime != "application/octet-stream":
        mime_type = client_mime
    else:
        mime_type = magic.from_buffer(file_bytes, mime=True)
    r = await _get_redis()

    # Deduplication — return existing job if same file already submitted by this key
    doc_hash = document_hash(file_bytes)
    if sub_id:
        existing_job_id = await check_dedupe(r, sub_id, doc_hash)
        if existing_job_id:
            return _accept_response(existing_job_id, estimate_seconds(mime_type, len(file_bytes)))

    # Quota check + immediate deduction
    if sub_id and _quota:
        rejection = await _quota.check(sub_id, len(file_bytes))
        if rejection:
            raise HTTPException(status_code=429, detail=rejection)
        await _quota.record(sub_id, len(file_bytes))

    job = Job.create(
        sub_id=sub_id,
        mime_type=mime_type,
        filename=file.filename or "document",
        deadline_seconds=REQUEST_TIMEOUT,
        verbose=verbose,
        accept_header=accept,
    )

    await blobstore.put(job.input_blob_key, encrypt(file_bytes))
    await enqueue(r, job)

    # Set dedup key so identical resubmissions return the same job
    if sub_id:
        await set_dedupe(r, sub_id, doc_hash, job.job_id)

    return _accept_response(job.job_id, estimate_seconds(mime_type, len(file_bytes)))


@app.get("/result/{job_id}")
async def poll_result(job_id: str):
    r = await _get_redis()
    result = await get_result(r, job_id)

    if result is None:
        # No result key — either still processing or unknown/expired
        # Check if the job exists in the stream (could add a job metadata key later)
        # For now, return 202 — the client will eventually get 200 or give up
        return JSONResponse(
            status_code=202,
            content={"job_id": job_id, "status": "processing"},
        )

    if result.status == "error":
        return JSONResponse(
            status_code=500,
            content={"job_id": job_id, "status": "error", "detail": result.error_detail},
        )

    output_key = f"{job_id}/output"
    encrypted_output = await blobstore.get(output_key)
    if encrypted_output is None:
        return JSONResponse(
            status_code=410,
            content={"job_id": job_id, "status": "expired", "detail": "Result retention expired"},
        )
    payload = json.loads(decrypt(encrypted_output))

    return Response(
        content=json.dumps(payload),
        media_type="application/json",
        headers=_billing_headers(payload),
    )


@app.on_event("startup")
async def startup():
    global _quota
    r = await quota.get_redis()
    if r:
        _quota = QuotaService(r)
        await ensure_group(r)


@app.on_event("shutdown")
async def shutdown():
    await quota.close()


@app.get("/health")
async def health_check():
    return {"status": "ok"}
