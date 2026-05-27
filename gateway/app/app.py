import asyncio
import json
import logging
import os
import time

import xxhash

from fastapi import FastAPI, File, Header, Query, Request, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
import magic
from io import BytesIO

from . import blobstore
from .convert import convert, UnsupportedFormat, ServiceNotConfigured
from .crypto import encrypt, decrypt
from .queue import Job, await_result, enqueue, get_result
from .services.image_postprocess import CaptioningUpstreamError
from .tracing import Trace
from . import quota

logger = logging.getLogger(__name__)

app = FastAPI()

DEBUG_MODE = os.environ.get("DEBUG", "").lower() in ("1", "true", "yes")
QUEUE_MODE = os.environ.get("QUEUE_MODE", "").lower() in ("1", "true", "yes")
CORS_ORIGINS = [o for o in os.environ.get("CORS_ORIGINS", "").split(",") if o]
MAX_FILE_SIZE = int(os.environ.get("MAX_FILE_SIZE_MB", "50")) * 1024 * 1024
REQUEST_TIMEOUT = float(os.environ.get("REQUEST_TIMEOUT", "300.0"))
_convert_semaphore = asyncio.Semaphore(int(os.environ.get("MAX_CONCURRENT_CONVERSIONS", "4")))

SANITISED_MESSAGES = {
    429: "Upstream rate limit exceeded",
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
    """In production, strip internal details from error responses."""
    if DEBUG_MODE:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    logger.error("HTTP %d: %s", exc.status_code, exc.detail)
    safe_message = SANITISED_MESSAGES.get(exc.status_code, exc.detail)
    return JSONResponse(status_code=exc.status_code, content={"detail": safe_message})


ECHO_HEADERS = {"x-subscription-id", "x-org-id", "x-request-id"}


async def _read_file(file: UploadFile) -> bytes:
    """Read and size-check an uploaded file."""
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


async def _convert_direct(file_bytes: bytes, mime_type: str, filename: str, verbose: bool, sub_id: str, trace: Trace):
    """Process conversion directly (QUEUE_MODE=false). Returns (result, mime_type)."""
    async with _convert_semaphore:
        try:
            deadline = time.monotonic() + REQUEST_TIMEOUT
            result = await convert(file_bytes, mime_type, filename, deadline, trace)
            trace.finish()
            result.detected_type = mime_type
            result.input_bytes = len(file_bytes)
            result.input_hash = xxhash.xxh64(file_bytes).hexdigest()
            result.trace = trace.to_dict()

            if sub_id:
                await quota.record_usage(sub_id, result.input_bytes)

            return result
        except CaptioningUpstreamError as e:
            raise HTTPException(status_code=500, detail=str(e))
        except UnsupportedFormat as e:
            raise HTTPException(status_code=400, detail=str(e))
        except ServiceNotConfigured as e:
            raise HTTPException(status_code=422, detail=str(e))


async def _convert_queued(file_bytes: bytes, mime_type: str, filename: str, verbose: bool, accept: str, sub_id: str):
    """Enqueue conversion job and wait for result (QUEUE_MODE=true)."""
    r = await quota.get_redis()
    if r is None:
        raise HTTPException(status_code=503, detail="Queue not available")

    job = Job.create(
        sub_id=sub_id,
        mime_type=mime_type,
        filename=filename,
        deadline_seconds=REQUEST_TIMEOUT,
        verbose=verbose,
        accept_header=accept,
    )

    # Write encrypted input to blob storage, enqueue job metadata to Redis
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

    # Read encrypted output from blob storage
    encrypted_output = await blobstore.get(job.output_blob_key)
    if encrypted_output is None:
        raise HTTPException(status_code=500, detail="Output blob not found")
    payload = json.loads(decrypt(encrypted_output))
    await blobstore.delete(job.output_blob_key)

    if sub_id:
        input_bytes = payload.get("metadata", {}).get("input_bytes", 0)
        await quota.record_usage(sub_id, input_bytes)

    return payload


@app.post("/convert")
async def convert_document(
    request: Request,
    file: UploadFile = File(...),
    verbose: bool = Query(False),
    accept: str = Header("application/json"),
):
    """Convert a file to markdown."""
    file_bytes = await _read_file(file)
    size = len(file_bytes)

    sub_id = request.headers.get("x-subscription-id", "")
    if sub_id:
        rejection = await quota.check_quota(sub_id, size)
        if rejection:
            raise HTTPException(status_code=429, detail=rejection)

    mime_type = magic.from_buffer(file_bytes, mime=True)

    if QUEUE_MODE:
        result = await _convert_queued(file_bytes, mime_type, file.filename or "document", verbose, accept, sub_id)
        if isinstance(result, JSONResponse):
            return result
        # result is a dict from the worker
        echo = {k: v for k, v in request.headers.items() if k.lower() in ECHO_HEADERS}
        return Response(
            content=json.dumps(result),
            media_type="application/json",
            headers=echo,
        )

    # Direct mode
    trace = Trace("request", file_size_bytes=size, mime_type=mime_type, filename=file.filename or "document")
    result = await _convert_direct(file_bytes, mime_type, file.filename or "document", verbose, sub_id, trace)

    echo = {k: v for k, v in request.headers.items() if k.lower() in ECHO_HEADERS}
    headers = {**result.audit_headers(), **echo, "X-Job-Metadata": result.metadata_json()}

    if "text/markdown" in accept:
        return Response(
            content=result.markdown,
            media_type="text/markdown; charset=utf-8",
            headers=headers,
        )

    return Response(
        content=json.dumps(result.to_dict(verbose=verbose)),
        media_type="application/json",
        headers=headers,
    )


@app.get("/result/{job_id}")
async def poll_result(job_id: str):
    """Poll for an async job result."""
    r = await quota.get_redis()
    if r is None:
        raise HTTPException(status_code=503, detail="Queue not available")

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


@app.on_event("shutdown")
async def shutdown():
    await quota.close()


@app.get("/health")
async def health_check():
    return {"status": "ok"}
