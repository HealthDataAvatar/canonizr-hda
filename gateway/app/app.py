"""FastAPI application — thin wiring layer.

Constructs Services at startup, endpoints call handler functions.
No business logic here.
"""

import logging
import os
from contextlib import asynccontextmanager
from io import BytesIO

import magic
from fastapi import FastAPI, File, Header, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from .azure_clients import get_blob_service, get_table_service
from .blob_azure import AzureBlobStore
from .context import Services
from .handlers import Rejected, accept_canonize, delete_result, download_artefact, download_artifact, poll_result
from .jobs_table import TableJobStore
from .queue import RedisQueue
from .quota import QuotaService
from .redis_client import get_redis
from .sanitize import content_disposition
from .services.camelot_tables import CamelotTableExtractor
from .services.captioning import OpenAIImageCaptioner
from .services.libreoffice import GotenbergOleConverter
from .services.liteparse import LiteParsePdfTextExtractor
from .services.markitdown import MarkItDownExtractor
from .services.pdfium_renderer import PdfiumPageRenderer
from .services.pikepdf_images import PikepdfImageExtractor
from .telemetry import PostHogEmitter
from .user_resolver import TableUserResolver

logger = logging.getLogger(__name__)
logging.getLogger("azure").setLevel(logging.WARNING)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _svc
    r = await get_redis()
    if r is None:
        raise RuntimeError("REDIS_URL is required")

    table_svc = get_table_service()
    blob_svc = get_blob_service()

    queue = RedisQueue(r)
    _svc = Services(
        blobs=AzureBlobStore(blob_svc),
        jobs=TableJobStore(table_svc),
        users=TableUserResolver(r, table_svc),  # type: ignore[arg-type]  # redis stubs return bytes|str; we use decode_responses=True
        queue=queue,
        quota=QuotaService(r, table_service=table_svc),  # type: ignore[arg-type]
        telemetry=PostHogEmitter(),
        captioner=OpenAIImageCaptioner(),
        pdf_text_extractor=LiteParsePdfTextExtractor(),
        pdf_image_extractor=PikepdfImageExtractor(),
        pdf_table_extractor=CamelotTableExtractor(),
        ole_converter=GotenbergOleConverter(),
        ooxml_extractor=MarkItDownExtractor(),
        page_renderer=PdfiumPageRenderer(),
    )
    await queue.ensure_group()
    yield
    from . import redis_client

    await redis_client.close_redis()


app = FastAPI(lifespan=lifespan)

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


async def _accept_and_respond(request: Request, file: UploadFile, base_path: str):
    """Shared logic for POST /v1/canonize and POST /v1/jobs."""
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
        result = await accept_canonize(file_bytes, file.filename or "document", mime_type, sub_id, _svc)
    except Rejected as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)

    return JSONResponse(
        status_code=202,
        content={
            "job_id": result.job_id,
            "status": "processing",
            "poll_url": f"{base_path}/{result.job_id}",
            "estimated_seconds": result.estimated_seconds,
            "input_bytes": result.input_bytes,
            "billable_units": result.billable_units,
            "retention_seconds": result.retention_seconds,
        },
        headers={
            "Location": f"{base_path}/{result.job_id}",
            "Retry-After": str(result.estimated_seconds),
            "X-Input-Size-Bytes": str(result.input_bytes),
            "X-Billable-Units": str(result.billable_units),
        },
    )


@app.post("/v1/canonize")
async def create_canonize_job(
    request: Request,
    file: UploadFile = File(...),
):
    return await _accept_and_respond(request, file, "/v1/canonize")


@app.post("/v1/jobs")
async def create_job(
    request: Request,
    file: UploadFile = File(...),
    verbose: bool = Query(False),
    accept: str = Header("application/json"),
):
    return await _accept_and_respond(request, file, "/v1/jobs")


@app.get("/v1/canonize/{job_id}")
async def get_canonize_job(job_id: str):
    assert _svc is not None
    result = await poll_result(job_id, _svc)
    if result.status_code == 200 and result.body:
        import json

        return Response(content=json.dumps(result.body), media_type="application/json", headers=result.headers or {})
    return JSONResponse(status_code=result.status_code, content=result.body or {})


@app.delete("/v1/canonize/{job_id}")
async def delete_canonize_job(request: Request, job_id: str):
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


@app.get("/v1/canonize/{job_id}/artefacts/{name}")
async def get_canonize_artefact(request: Request, job_id: str, name: str):
    assert _svc is not None
    sub_id = request.headers.get("x-subscription-id", "")
    if not sub_id:
        raise HTTPException(status_code=401, detail="Missing subscription ID")
    try:
        result = await download_artefact(job_id, sub_id, name, _svc)
    except Rejected as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)
    return Response(
        content=result.data,
        media_type=result.content_type,
        headers={"Content-Disposition": content_disposition(result.filename)},
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
        headers={"Content-Disposition": content_disposition(result.filename)},
    )


@app.get("/v1/jobs/{job_id}/artefacts/{name}")
async def get_artefact(request: Request, job_id: str, name: str):
    assert _svc is not None

    sub_id = request.headers.get("x-subscription-id", "")
    if not sub_id:
        raise HTTPException(status_code=401, detail="Missing subscription ID")

    try:
        result = await download_artefact(job_id, sub_id, name, _svc)
    except Rejected as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)

    return Response(
        content=result.data,
        media_type=result.content_type,
        headers={"Content-Disposition": content_disposition(result.filename)},
    )


@app.get("/health")
async def health_check():
    return {"status": "ok"}
