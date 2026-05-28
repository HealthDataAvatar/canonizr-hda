"""Worker process — thin wiring layer.

Constructs Services at startup, main loop calls process_job.
No business logic here.
"""

import asyncio
import logging
import os

from .blob_azure import AzureBlobStore
from .context import Services
from .jobs_table import TableJobStore
from .process import process_job
from .queue import RedisQueue
from .quota import QuotaService, get_redis
from .user_resolver import TableUserResolver

logger = logging.getLogger(__name__)


async def run():
    """Main worker loop — dequeue and process jobs forever."""
    logger.info("Worker starting")
    r = await get_redis()
    if r is None:
        raise RuntimeError("REDIS_URL is required for the worker")

    blob_conn = os.environ.get("BLOB_STORAGE_CONNECTION_STRING", "")
    table_conn = os.environ.get("TABLE_STORAGE_CONNECTION_STRING", "")

    queue = RedisQueue(r)
    svc = Services(
        blobs=AzureBlobStore(blob_conn),
        jobs=TableJobStore(table_conn),
        users=TableUserResolver(r, table_conn),
        queue=queue,
        quota=QuotaService(r),
    )
    await queue.ensure_group()
    logger.info("Worker ready, waiting for jobs")

    while True:
        job = await svc.queue.dequeue(timeout=5000)
        if job is None:
            continue

        logger.info("Processing job %s (%s, %s)", job.job_id, job.mime_type, job.filename)

        user = await svc.users.resolve(job.sub_id)
        if user is None:
            logger.error("Job %s has unmapped subscription %s — skipping", job.job_id, job.sub_id)
            await svc.queue.acknowledge(job)
            continue

        proc = await process_job(job, user, svc)
        await svc.queue.store_result(job.job_id, proc.job_result)
        await svc.queue.acknowledge(job)

        # On failure: refund quota and clear dedupe key so user can retry
        if proc.job_result.status == "error" and job.sub_id and proc.file_size > 0:
            await svc.quota.refund(job.sub_id, proc.file_size)
            if proc.doc_hash:
                await svc.queue.delete_dedupe(job.sub_id, proc.doc_hash)
            logger.info("Job %s failed — refunded %d bytes, cleared dedupe", job.job_id, proc.file_size)

        logger.info("Job %s completed with status %s (acked)", job.job_id, proc.job_result.status)


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    asyncio.run(run())


if __name__ == "__main__":
    main()
