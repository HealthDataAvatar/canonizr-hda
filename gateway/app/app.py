"""FastAPI application — thin wiring layer.

Constructs Services at startup, endpoints call handler functions.
No business logic here.
"""

import logging
import os

import magic
from fastapi import FastAPI, File, Header, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from .blob_azure import AzureBlobStore
from .context import Services
from .handlers import Rejected, accept_job, delete_result, download_artifact, poll_result
from .jobs_table import TableJobStore
from .queue import RedisQueue
from .quota import QuotaService, get_redis
from .user_resolver import TableUserResolver

logger = logging.getLogger(__name__)

app = FastAPI()

DEBUG_MODE = os.environ.get("DEBUG", "").lower() in ("1", "true", "yes")
CORS_ORIGINS = [o for o in os.environ.get("CORS_ORIGINS", "").split(",") if o]
MAX_FILE_SIZE = int(os.environ.get("MAX_FILE_SIZE_MB", "50")) * 1024 * 1024

SANITISED_MESSAGES = {
    429: "Rate limit exceeded",
    500: "Internal processing error",
    502: "Upstream service error",
    504: "Upstream service timeout",
}

if CORS_ORIGINS:
    app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])

_svc: Services | None = None


@app.exception_handler(HTTPException)
async def sanitise_errors(request: Request, exc: HTTPException):
    if DEBUG_MODE:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    logger.error("HTTP %d: %s", exc.status_code, exc.detail)
    safe_message = SANITISED_MESSAGES.get(exc.status_code, exc.detail)
    return JSONResponse(status_code=exc.status_code, content={"detail": safe_message})


from io import BytesIO


async def _read_file(file: UploadFile) -> bytes:
    content = BytesIO()
    size = 0
    while True:
        chunk = await file.read(1024 * 1024)
        if not chunk:
            break
        size += len(chunk)
        if size > MAX_FILE_SIZE:
            raise HTTPException(status_code=413, detail=f"File too large (max {MAX_FILE_SIZE // (1024 * 1024)}MB)")
        content.write(chunk)
    content.seek(0)
    return content.read()


@app.post("/v1/jobs")
async def create_job(
    request: Request,
    file: UploadFile = File(...),
    verbose: bool = Query(False),
    accept: str = Header("application/json"),
):
    assert _svc is not None

    file_bytes = await _read_file(file)
    sub_id = request.headers.get("x-subscription-id", "")
    if not sub_id:
        raise HTTPException(status_code=401, detail="Missing subscription ID")

    # Trust client MIME type if provided and specific; fall back to magic detection
    client_mime = file.content_type or ""
    if client_mime and client_mime != "application/octet-stream":
        mime_type = client_mime
    else:
        mime_type = magic.from_buffer(file_bytes, mime=True)

    try:
        result = await accept_job(file_bytes, file.filename or "document", mime_type, sub_id, _svc)
    except Rejected as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)

    return JSONResponse(
        status_code=202,
        content={
            "job_id": result.job_id,
            "status": "processing",
            "poll_url": f"/v1/jobs/{result.job_id}",
            "estimated_seconds": result.estimated_seconds,
            "input_bytes": result.input_bytes,
            "billable_units": result.billable_units,
        },
        headers={
            "Location": f"/v1/jobs/{result.job_id}",
            "Retry-After": str(result.estimated_seconds),
            "X-Input-Size-Bytes": str(result.input_bytes),
            "X-Billable-Units": str(result.billable_units),
        },
    )


@app.get("/v1/jobs/{job_id}")
async def get_job(job_id: str):
    assert _svc is not None

    result = await poll_result(job_id, _svc)

    if result.status_code == 200 and result.body:
        import json

        return Response(
            content=json.dumps(result.body),
            media_type="application/json",
            headers=result.headers or {},
        )

    return JSONResponse(status_code=result.status_code, content=result.body or {})


@app.delete("/v1/jobs/{job_id}")
async def delete_job(request: Request, job_id: str):
    assert _svc is not None

    sub_id = request.headers.get("x-subscription-id", "")
    if not sub_id:
        raise HTTPException(status_code=401, detail="Missing subscription ID")

    try:
        found = await delete_result(job_id, sub_id, _svc)
    except Rejected as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)

    if not found:
        raise HTTPException(status_code=404, detail="Job not found")

    return Response(status_code=204)


@app.get("/v1/jobs/{job_id}/{artifact}")
async def get_artifact(request: Request, job_id: str, artifact: str):
    assert _svc is not None

    sub_id = request.headers.get("x-subscription-id", "")
    if not sub_id:
        raise HTTPException(status_code=401, detail="Missing subscription ID")

    try:
        result = await download_artifact(job_id, sub_id, artifact, _svc)
    except Rejected as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)

    return Response(
        content=result.data,
        media_type=result.content_type,
        headers={"Content-Disposition": f'attachment; filename="{result.filename}"'},
    )


@app.on_event("startup")
async def startup():
    global _svc
    r = await get_redis()
    if r is None:
        raise RuntimeError("REDIS_URL is required")

    blob_url = os.environ.get("BLOB_STORAGE_URL", "")
    blob_conn = os.environ.get("BLOB_STORAGE_CONNECTION_STRING", "")
    table_url = os.environ.get("TABLE_STORAGE_URL", "")
    table_conn = os.environ.get("TABLE_STORAGE_CONNECTION_STRING", "")

    queue = RedisQueue(r)
    _svc = Services(
        blobs=AzureBlobStore(account_url=blob_url, connection_string=blob_conn),
        jobs=TableJobStore(endpoint=table_url, connection_string=table_conn),
        users=TableUserResolver(r, endpoint=table_url, connection_string=table_conn),
        queue=queue,
        quota=QuotaService(r, endpoint=table_url, connection_string=table_conn),
    )
    await queue.ensure_group()


@app.on_event("shutdown")
async def shutdown():
    from . import quota

    await quota.close()


@app.get("/health")
async def health_check():
    return {"status": "ok"}
