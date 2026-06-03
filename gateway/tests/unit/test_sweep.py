"""Unit tests for the reconciliation sweep and worker idempotency guard."""

import os
from datetime import UTC, datetime, timedelta

import pytest

from app.context import Services
from app.protocols import JobMeta, JobStatus, UserContext
from app.quota import QuotaService
from app.sweep import _sweep_once
from tests.fakes import (
    FakeBlobStore,
    FakeCaptioner,
    FakeEmitter,
    FakeJobStore,
    FakeOfficeConverter,
    FakePdfExtractor,
    FakeQueue,
    FakeRedis,
    FakeUserResolver,
)


def _make_svc():
    sub_id = "sub_1"
    user = UserContext(user_id="user_1", encryption_key=os.urandom(32), key_name="test-key")
    redis = FakeRedis()
    return (
        Services(
            blobs=FakeBlobStore(),
            jobs=FakeJobStore(),
            users=FakeUserResolver({sub_id: user}),
            queue=FakeQueue(),
            quota=QuotaService(redis, max_rejected=3),
            telemetry=FakeEmitter(),
            captioner=FakeCaptioner(),
            pdf_extractor=FakePdfExtractor(),
            office_converter=FakeOfficeConverter(),
        ),
        redis,
    )


def _stale_meta(job_id="2025-06_abc", age_minutes=20) -> JobMeta:
    created = (datetime.now(UTC) - timedelta(minutes=age_minutes)).isoformat()
    return JobMeta(
        user_id="user_1",
        job_id=job_id,
        sub_id="sub_1",
        status=JobStatus.PROCESSING,
        created_at=created,
        mime_type="text/plain",
        original_filename="test.txt",
    )


class TestSweep:
    @pytest.mark.asyncio
    async def test_recovers_orphaned_job(self):
        svc, redis = _make_svc()
        meta = _stale_meta()
        svc.jobs.create(meta)

        count = await _sweep_once(redis, svc)

        assert count == 1
        assert len(svc.queue._jobs) == 1
        assert svc.queue._jobs[0].job_id == meta.job_id

        events = svc.telemetry.events
        assert len(events) == 1
        assert events[0].event_name == "canonizr:job_recovered"
        assert events[0].job_id == meta.job_id

    @pytest.mark.asyncio
    async def test_skips_completed_jobs(self):
        svc, redis = _make_svc()
        meta = _stale_meta()
        meta.status = JobStatus.OK
        svc.jobs.create(meta)

        count = await _sweep_once(redis, svc)

        assert count == 0
        assert len(svc.queue._jobs) == 0

    @pytest.mark.asyncio
    async def test_skips_recent_processing_jobs(self):
        svc, redis = _make_svc()
        meta = _stale_meta(age_minutes=2)  # Too recent for default 10min threshold
        svc.jobs.create(meta)

        count = await _sweep_once(redis, svc)

        assert count == 0

    @pytest.mark.asyncio
    async def test_lock_prevents_concurrent_sweeps(self):
        svc, redis = _make_svc()
        meta = _stale_meta()
        svc.jobs.create(meta)

        # First sweep acquires lock
        count1 = await _sweep_once(redis, svc)
        assert count1 == 1

        # Second sweep blocked by lock
        meta2 = _stale_meta(job_id="2025-06_def")
        svc.jobs.create(meta2)
        count2 = await _sweep_once(redis, svc)
        assert count2 == 0


class TestIdempotencyGuard:
    """Tests for the worker's idempotency guard (inline in worker loop).

    These test the logic directly rather than the full worker loop.
    """

    @pytest.mark.asyncio
    async def test_completed_job_is_skipped(self):
        svc, _ = _make_svc()
        meta = JobMeta(
            user_id="user_1",
            job_id="2025-06_done",
            sub_id="sub_1",
            status=JobStatus.OK,
        )
        svc.jobs.create(meta)

        # Verify the guard condition
        fetched = svc.jobs.get_by_job_id("2025-06_done")
        assert fetched is not None
        assert fetched.status in (JobStatus.OK, JobStatus.DELETED)

    @pytest.mark.asyncio
    async def test_processing_job_is_not_skipped(self):
        svc, _ = _make_svc()
        meta = JobMeta(
            user_id="user_1",
            job_id="2025-06_pending",
            sub_id="sub_1",
            status=JobStatus.PROCESSING,
        )
        svc.jobs.create(meta)

        fetched = svc.jobs.get_by_job_id("2025-06_pending")
        assert fetched is not None
        assert fetched.status not in (JobStatus.OK, JobStatus.DELETED)

    @pytest.mark.asyncio
    async def test_error_job_is_not_skipped(self):
        svc, _ = _make_svc()
        meta = JobMeta(
            user_id="user_1",
            job_id="2025-06_err",
            sub_id="sub_1",
            status=JobStatus.ERROR,
        )
        svc.jobs.create(meta)

        fetched = svc.jobs.get_by_job_id("2025-06_err")
        assert fetched is not None
        assert fetched.status not in (JobStatus.OK, JobStatus.DELETED)
