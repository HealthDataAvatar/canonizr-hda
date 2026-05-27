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
from .queue import Job, await_result, enqueue, ensure_group, get_result

logger = logging.getLogger(__name__)

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


async def _get_redis():
    r = await quota.get_redis()
    if r is None:
        raise HTTPException(status_code=503, detail="Service unavailable")
    return r


@app.post("/convert")
async def convert_document(
    request: Request,
    file: UploadFile = File(...),
    verbose: bool = Query(False),
    accept: str = Header("application/json"),
):
    file_bytes = await _read_file(file)

    sub_id = request.headers.get("x-subscription-id", "")
    if sub_id:
        rejection = await quota.check_quota(sub_id, len(file_bytes))
        if rejection:
            raise HTTPException(status_code=429, detail=rejection)

    mime_type = magic.from_buffer(file_bytes, mime=True)
    r = await _get_redis()

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

    result = await await_result(r, job.job_id, timeout=REQUEST_TIMEOUT)
    if result is None:
        return JSONResponse(
            status_code=202,
            content={"job_id": job.job_id, "status": "processing"},
            headers={"Location": f"/result/{job.job_id}"},
        )

    if result.status == "error":
        raise HTTPException(status_code=result.status_code, detail=result.error_detail)

    encrypted_output = await blobstore.get(job.output_blob_key)
    if encrypted_output is None:
        raise HTTPException(status_code=500, detail="Output blob not found")
    payload = json.loads(decrypt(encrypted_output))
    await blobstore.delete(job.output_blob_key)

    if sub_id:
        input_bytes = payload.get("metadata", {}).get("input_bytes", 0)
        await quota.record_usage(sub_id, input_bytes)

    echo = {k: v for k, v in request.headers.items() if k.lower() in ECHO_HEADERS}
    return Response(
        content=json.dumps(payload),
        media_type="application/json",
        headers=echo,
    )


@app.get("/result/{job_id}")
async def poll_result(job_id: str):
    r = await _get_redis()
    result = await get_result(r, job_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Result not found or expired")

    if result.status == "error":
        raise HTTPException(status_code=result.status_code, detail=result.error_detail)

    output_key = f"{job_id}/output"
    encrypted_output = await blobstore.get(output_key)
    if encrypted_output is None:
        raise HTTPException(status_code=404, detail="Output expired or already collected")
    payload = json.loads(decrypt(encrypted_output))
    await blobstore.delete(output_key)

    return Response(
        content=json.dumps(payload),
        media_type="application/json",
    )


@app.on_event("startup")
async def startup():
    r = await quota.get_redis()
    if r:
        await ensure_group(r)


@app.on_event("shutdown")
async def shutdown():
    await quota.close()


@app.get("/health")
async def health_check():
    return {"status": "ok"}
