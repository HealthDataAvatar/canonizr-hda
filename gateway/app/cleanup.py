"""Cleanup job — deletes blobs for expired and soft-deleted jobs.

Runs as a Container App Job on a cron schedule.
Scans GwJobs for jobs that are:
  1. Past retention_expires (marks as DELETED, deletes blobs)
  2. Already DELETED but blobs may still exist (belt-and-suspenders)
"""

import asyncio
import logging
import os
import sys
from dataclasses import dataclass
from datetime import UTC, datetime

from .blob_azure import AzureBlobStore
from .jobs_table import TableJobStore
from .protocols import BlobStore, JobMeta, JobStatus, JobStore
from .telemetry import CleanupCompleted, PostHogEmitter

logger = logging.getLogger(__name__)


@dataclass
class CleanupResult:
    scanned: int = 0
    blobs_deleted: int = 0
    marked_deleted: int = 0
    already_clean: int = 0
    errors: int = 0


async def run_cleanup(jobs: JobStore, blobs: BlobStore) -> CleanupResult:
    now = datetime.now(UTC).isoformat()
    result = CleanupResult()

    # Pass 1: expired jobs — mark deleted + clean blobs
    for meta in jobs.list_expired(before=now):
        await _clean_job(meta, jobs, blobs, result, mark_deleted=True)

    # Pass 2: already-deleted jobs — ensure blobs are gone
    for meta in jobs.list_deleted():
        await _clean_job(meta, jobs, blobs, result, mark_deleted=False)

    return result


async def _clean_job(
    meta: JobMeta, jobs: JobStore, blobs: BlobStore, result: CleanupResult, *, mark_deleted: bool
) -> None:
    result.scanned += 1
    prefix = f"{meta.user_id}/{meta.job_id}/"

    try:
        deleted_count = await blobs.delete_prefix(prefix)
        result.blobs_deleted += deleted_count

        if deleted_count == 0:
            result.already_clean += 1

        if mark_deleted:
            meta.status = JobStatus.DELETED
            jobs.update(meta)
            result.marked_deleted += 1

    except Exception as e:
        logger.error("Failed to clean up %s: %s", meta.job_id, e)
        result.errors += 1


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    blob_url = os.environ.get("BLOB_STORAGE_URL", "")
    blob_conn = os.environ.get("BLOB_STORAGE_CONNECTION_STRING", "")
    table_url = os.environ.get("TABLE_STORAGE_URL", "")
    table_conn = os.environ.get("TABLE_STORAGE_CONNECTION_STRING", "")

    blobs = AzureBlobStore(account_url=blob_url, connection_string=blob_conn)
    jobs = TableJobStore(endpoint=table_url, connection_string=table_conn)
    emitter = PostHogEmitter()

    status = "ok"
    error = ""
    result = CleanupResult()

    try:
        result = asyncio.run(run_cleanup(jobs, blobs))
        if result.errors > 0:
            status = "partial"
    except Exception as e:
        logger.exception("Cleanup job failed")
        status = "error"
        error = str(e)

    emitter.emit(
        CleanupCompleted(
            status=status,
            error=error,
            scanned=result.scanned,
            blobs_deleted=result.blobs_deleted,
            marked_deleted=result.marked_deleted,
            already_clean=result.already_clean,
            errors=result.errors,
        )
    )
    emitter.shutdown()

    if status == "error":
        sys.exit(1)


if __name__ == "__main__":
    main()
