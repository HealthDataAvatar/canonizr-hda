"""Unit tests for the job queue module — mocks Redis."""
from unittest.mock import AsyncMock

import pytest

from app.queue import Job, JobResult, enqueue, dequeue, store_result, await_result, get_result


class TestJobSerialization:
    def test_round_trip(self):
        job = Job.create(
            sub_id="sub_1",
            mime_type="application/pdf",
            filename="test.pdf",
            deadline_seconds=60.0,
        )
        restored = Job.deserialize(job.serialize())
        assert restored.job_id == job.job_id
        assert restored.sub_id == "sub_1"
        assert restored.mime_type == "application/pdf"
        assert restored.filename == "test.pdf"
        assert restored.deadline_seconds == 60.0
        assert restored.verbose is False

    def test_create_generates_unique_ids(self):
        j1 = Job.create(sub_id="s", mime_type="", filename="", deadline_seconds=0)
        j2 = Job.create(sub_id="s", mime_type="", filename="", deadline_seconds=0)
        assert j1.job_id != j2.job_id

    def test_blob_keys(self):
        job = Job.create(sub_id="s", mime_type="", filename="", deadline_seconds=0)
        assert job.input_blob_key == f"{job.job_id}/input"
        assert job.output_blob_key == f"{job.job_id}/output"


class TestJobResultSerialization:
    def test_round_trip_ok(self):
        result = JobResult(job_id="abc", status="ok", status_code=200)
        restored = JobResult.deserialize(result.serialize())
        assert restored.job_id == "abc"
        assert restored.status == "ok"
        assert restored.status_code == 200

    def test_round_trip_error(self):
        result = JobResult(job_id="abc", status="error", error_detail="something broke", status_code=502)
        restored = JobResult.deserialize(result.serialize())
        assert restored.status == "error"
        assert restored.error_detail == "something broke"
        assert restored.status_code == 502


class TestEnqueue:
    @pytest.mark.asyncio
    async def test_enqueue_pushes_to_redis(self):
        r = AsyncMock()
        job = Job.create(sub_id="sub_1", mime_type="application/pdf",
                         filename="test.pdf", deadline_seconds=60.0)
        result = await enqueue(r, job)
        assert result == job.job_id
        r.lpush.assert_called_once()
        args = r.lpush.call_args[0]
        assert args[0] == "queue:convert"


class TestDequeue:
    @pytest.mark.asyncio
    async def test_dequeue_returns_job(self):
        job = Job.create(sub_id="sub_1", mime_type="text/plain",
                         filename="test.txt", deadline_seconds=30.0)
        r = AsyncMock()
        r.brpop.return_value = ("queue:convert", job.serialize())
        result = await dequeue(r, timeout=5)
        assert result is not None
        assert result.job_id == job.job_id
        assert result.sub_id == "sub_1"

    @pytest.mark.asyncio
    async def test_dequeue_returns_none_on_timeout(self):
        r = AsyncMock()
        r.brpop.return_value = None
        result = await dequeue(r, timeout=1)
        assert result is None


class TestStoreResult:
    @pytest.mark.asyncio
    async def test_stores_signal_in_both_locations(self):
        pipe = AsyncMock()
        r = AsyncMock()
        r.pipeline = lambda: pipe
        result = JobResult(job_id="abc", status="ok", status_code=200)
        await store_result(r, "abc", result, ttl=60)
        pipe.lpush.assert_called_once()
        pipe.set.assert_called_once()
        pipe.execute.assert_called_once()


class TestAwaitResult:
    @pytest.mark.asyncio
    async def test_returns_result(self):
        result = JobResult(job_id="abc", status="ok", status_code=200)
        r = AsyncMock()
        r.blpop.return_value = ("result:abc", result.serialize())
        got = await await_result(r, "abc", timeout=10)
        assert got is not None
        assert got.job_id == "abc"
        assert got.status == "ok"

    @pytest.mark.asyncio
    async def test_returns_none_on_timeout(self):
        r = AsyncMock()
        r.blpop.return_value = None
        got = await await_result(r, "abc", timeout=1)
        assert got is None


class TestGetResult:
    @pytest.mark.asyncio
    async def test_returns_cached_result(self):
        result = JobResult(job_id="abc", status="ok", status_code=200)
        r = AsyncMock()
        r.get.return_value = result.serialize()
        got = await get_result(r, "abc")
        assert got is not None
        assert got.job_id == "abc"
        r.get.assert_called_once_with("resultcache:abc")

    @pytest.mark.asyncio
    async def test_returns_none_when_missing(self):
        r = AsyncMock()
        r.get.return_value = None
        got = await get_result(r, "abc")
        assert got is None
