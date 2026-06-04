"""Unit tests for cleanup job — uses fakes."""

from datetime import UTC, datetime, timedelta

import pytest

from app.cleanup import run_cleanup
from app.protocols import JobMeta, JobStatus
from tests.fakes import FakeBlobStore, FakeJobStore


def _now_iso():
    return datetime.now(UTC).isoformat()


def _past_iso(hours=1):
    return (datetime.now(UTC) - timedelta(hours=hours)).isoformat()


def _future_iso(hours=1):
    return (datetime.now(UTC) + timedelta(hours=hours)).isoformat()


class TestCleanup:
    @pytest.mark.asyncio
    async def test_deletes_expired_blobs_and_marks_deleted(self):
        jobs = FakeJobStore()
        blobs = FakeBlobStore()

        meta = JobMeta(user_id="u1", job_id="j1", sub_id="s1", status=JobStatus.OK, retention_expires=_past_iso())
        jobs.create(meta)
        await blobs.put("u1/j1/input.bin", b"data")
        await blobs.put("u1/j1/output.bin", b"result")

        result = await run_cleanup(jobs, blobs)

        assert result.scanned == 2  # pass 1: expired, pass 2: now deleted
        assert result.blobs_deleted == 2
        assert result.marked_deleted == 1
        j1 = jobs.get("j1")
        assert j1 is not None
        assert j1.status == JobStatus.DELETED
        assert await blobs.get("u1/j1/input.bin") is None
        assert await blobs.get("u1/j1/output.bin") is None

    @pytest.mark.asyncio
    async def test_skips_non_expired_jobs(self):
        jobs = FakeJobStore()
        blobs = FakeBlobStore()

        meta = JobMeta(user_id="u1", job_id="j1", sub_id="s1", status=JobStatus.OK, retention_expires=_future_iso())
        jobs.create(meta)
        await blobs.put("u1/j1/output.bin", b"result")

        result = await run_cleanup(jobs, blobs)

        assert result.scanned == 0
        j1 = jobs.get("j1")
        assert j1 is not None
        assert j1.status == JobStatus.OK

    @pytest.mark.asyncio
    async def test_cleans_blobs_for_already_deleted_jobs(self):
        jobs = FakeJobStore()
        blobs = FakeBlobStore()

        meta = JobMeta(user_id="u1", job_id="j1", sub_id="s1", status=JobStatus.DELETED)
        jobs.create(meta)
        await blobs.put("u1/j1/input.bin", b"orphan")

        result = await run_cleanup(jobs, blobs)

        assert result.scanned == 1
        assert result.blobs_deleted == 1
        assert result.marked_deleted == 0  # already deleted, don't re-mark
        assert await blobs.get("u1/j1/input.bin") is None

    @pytest.mark.asyncio
    async def test_already_clean_deleted_job(self):
        jobs = FakeJobStore()
        blobs = FakeBlobStore()

        meta = JobMeta(user_id="u1", job_id="j1", sub_id="s1", status=JobStatus.DELETED)
        jobs.create(meta)
        # No blobs exist

        result = await run_cleanup(jobs, blobs)

        assert result.scanned == 1
        assert result.blobs_deleted == 0
        assert result.already_clean == 1

    @pytest.mark.asyncio
    async def test_mixed_expired_and_active(self):
        jobs = FakeJobStore()
        blobs = FakeBlobStore()

        expired = JobMeta(user_id="u1", job_id="j1", sub_id="s1", status=JobStatus.OK, retention_expires=_past_iso())
        active = JobMeta(user_id="u1", job_id="j2", sub_id="s1", status=JobStatus.OK, retention_expires=_future_iso())
        jobs.create(expired)
        jobs.create(active)
        await blobs.put("u1/j1/output.bin", b"old")
        await blobs.put("u1/j2/output.bin", b"current")

        result = await run_cleanup(jobs, blobs)

        assert result.marked_deleted == 1
        j1 = jobs.get("j1")
        j2 = jobs.get("j2")
        assert j1 is not None
        assert j2 is not None
        assert j1.status == JobStatus.DELETED
        assert j2.status == JobStatus.OK
        assert await blobs.get("u1/j2/output.bin") == b"current"
