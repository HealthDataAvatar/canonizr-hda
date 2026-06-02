"""Reconciliation sweep — recovers orphaned jobs after Redis data loss.

Runs as a background task in each worker process. Only one worker
sweeps at a time (Redis lock). Scans Table Storage for jobs stuck
in PROCESSING beyond a threshold and re-enqueues them.
"""

import asyncio
import logging
import os
from datetime import UTC, datetime, timedelta

from .keys import sweep_lock
from .protocols import Job
from .telemetry import JobRecovered

logger = logging.getLogger(__name__)

SWEEP_INTERVAL = int(os.environ.get("SWEEP_INTERVAL_SECONDS", "300"))
SWEEP_STALE_THRESHOLD = int(os.environ.get("SWEEP_STALE_SECONDS", "600"))
SWEEP_LOCK_TTL = SWEEP_INTERVAL + 60  # lock expires after interval + margin


async def run_sweep_loop(svc) -> None:
    """Background loop: periodically sweep for orphaned jobs."""
    from .quota import get_redis

    r = await get_redis()
    if r is None:
        logger.warning("Sweep disabled — no Redis connection")
        return

    logger.info("Sweep loop started (interval=%ds, threshold=%ds)", SWEEP_INTERVAL, SWEEP_STALE_THRESHOLD)

    while True:
        await asyncio.sleep(SWEEP_INTERVAL)
        try:
            await _sweep_once(r, svc)
        except Exception:
            logger.exception("Sweep iteration failed")


async def _sweep_once(r, svc) -> int:
    """Run one sweep. Returns number of jobs recovered."""
    acquired = await r.set(sweep_lock(), "1", nx=True, ex=SWEEP_LOCK_TTL)
    if not acquired:
        return 0

    threshold = (datetime.now(UTC) - timedelta(seconds=SWEEP_STALE_THRESHOLD)).isoformat()
    orphaned = svc.jobs.list_processing(older_than=threshold)

    if not orphaned:
        return 0

    logger.info("Sweep found %d orphaned jobs", len(orphaned))
    recovered = 0

    for meta in orphaned:
        age = (datetime.now(UTC) - datetime.fromisoformat(meta.created_at)).total_seconds()
        job = Job(
            job_id=meta.job_id,
            stream_id="",
            sub_id=meta.sub_id,
            mime_type=meta.mime_type,
            filename=meta.original_filename,
            deadline_seconds=300,
        )
        await svc.queue.enqueue(job)
        svc.telemetry.emit(
            JobRecovered(
                job_id=meta.job_id,
                user_id=meta.user_id,
                age_seconds=age,
                original_status=meta.status,
            )
        )
        logger.info("Recovered orphaned job %s (age %.0fs)", meta.job_id, age)
        recovered += 1

    return recovered
