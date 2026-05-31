"""Unit tests for the RedisQueue — mocks Redis."""

from unittest.mock import AsyncMock

import pytest

from app.protocols import Job, JobResult
from app.queue import GROUP_NAME, STREAM_KEY, RedisQueue


class TestJobSerialization:
    def test_to_fields_and_back(self):
        job = Job.create(sub_id="sub_1", mime_type="application/pdf", filename="test.pdf", deadline_seconds=60.0)
        fields = job.to_fields()
        restored = Job.from_fields("1-0", fields)
        assert restored.job_id == job.job_id
        assert restored.stream_id == "1-0"
        assert restored.sub_id == "sub_1"

    def test_create_generates_unique_ids(self):
        j1 = Job.create(sub_id="s", mime_type="", filename="", deadline_seconds=0)
        j2 = Job.create(sub_id="s", mime_type="", filename="", deadline_seconds=0)
        assert j1.job_id != j2.job_id


class TestJobResultSerialization:
    def test_round_trip_ok(self):
        result = JobResult(job_id="abc", status="ok", status_code=200)
        restored = JobResult.deserialize(result.serialize())
        assert restored.status == "ok"

    def test_round_trip_error(self):
        result = JobResult(job_id="abc", status="error", detail="broke", status_code=502)
        restored = JobResult.deserialize(result.serialize())
        assert restored.detail == "broke"
        assert restored.status_code == 502


class TestEnsureGroup:
    @pytest.mark.asyncio
    async def test_creates_group(self):
        r = AsyncMock()
        q = RedisQueue(r)
        await q.ensure_group()
        r.xgroup_create.assert_called_once_with(STREAM_KEY, GROUP_NAME, id="0", mkstream=True)

    @pytest.mark.asyncio
    async def test_ignores_busygroup_error(self):
        import redis.asyncio as aioredis

        r = AsyncMock()
        r.xgroup_create.side_effect = aioredis.ResponseError("BUSYGROUP Consumer Group name already exists")
        q = RedisQueue(r)
        await q.ensure_group()


class TestEnqueue:
    @pytest.mark.asyncio
    async def test_xadds_to_stream(self):
        r = AsyncMock()
        q = RedisQueue(r)
        job = Job.create(sub_id="sub_1", mime_type="application/pdf", filename="test.pdf", deadline_seconds=60.0)
        result = await q.enqueue(job)
        assert result == job.job_id
        r.xadd.assert_called_once()


class TestDequeue:
    @pytest.mark.asyncio
    async def test_reclaims_stale_jobs_first(self):
        r = AsyncMock()
        q = RedisQueue(r)
        fields = Job.create(
            sub_id="sub_1", mime_type="text/plain", filename="test.txt", deadline_seconds=30.0
        ).to_fields()
        r.xautoclaim.return_value = ("0-0", [("1-1", fields)], [])
        result = await q.dequeue(timeout=5000)
        assert result is not None
        assert result.stream_id == "1-1"
        r.xreadgroup.assert_not_called()

    @pytest.mark.asyncio
    async def test_reads_new_when_no_stale(self):
        r = AsyncMock()
        q = RedisQueue(r)
        r.xautoclaim.return_value = ("0-0", [], [])
        fields = Job.create(
            sub_id="sub_1", mime_type="text/plain", filename="test.txt", deadline_seconds=30.0
        ).to_fields()
        r.xreadgroup.return_value = [[STREAM_KEY, [("2-0", fields)]]]
        result = await q.dequeue(timeout=5000)
        assert result is not None
        assert result.stream_id == "2-0"

    @pytest.mark.asyncio
    async def test_returns_none_on_timeout(self):
        r = AsyncMock()
        q = RedisQueue(r)
        r.xautoclaim.return_value = ("0-0", [], [])
        r.xreadgroup.return_value = None
        result = await q.dequeue(timeout=1000)
        assert result is None


class TestAcknowledge:
    @pytest.mark.asyncio
    async def test_xacks_the_message(self):
        r = AsyncMock()
        q = RedisQueue(r)
        job = Job(job_id="abc", stream_id="1-0", sub_id="s", mime_type="", filename="", deadline_seconds=0)
        await q.acknowledge(job)
        r.xack.assert_called_once_with(STREAM_KEY, GROUP_NAME, "1-0")


class TestStoreAndGetResult:
    @pytest.mark.asyncio
    async def test_stores_and_retrieves(self):
        r = AsyncMock()
        q = RedisQueue(r)
        result = JobResult(job_id="abc", status="ok", status_code=200)
        await q.store_result("abc", result)
        r.set.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_returns_none_when_missing(self):
        r = AsyncMock()
        r.get.return_value = None
        q = RedisQueue(r)
        assert await q.get_result("abc") is None

    @pytest.mark.asyncio
    async def test_get_returns_result(self):
        r = AsyncMock()
        result = JobResult(job_id="abc", status="ok", status_code=200)
        r.get.return_value = result.serialize()
        q = RedisQueue(r)
        got = await q.get_result("abc")
        assert got is not None
        assert got.status == "ok"


class TestDedupe:
    @pytest.mark.asyncio
    async def test_check_returns_none_on_miss(self):
        r = AsyncMock()
        r.get.return_value = None
        q = RedisQueue(r)
        assert await q.check_dedupe("sub1", "hash1") is None

    @pytest.mark.asyncio
    async def test_check_returns_job_id_on_hit(self):
        r = AsyncMock()
        r.get.return_value = "existing-job"
        q = RedisQueue(r)
        assert await q.check_dedupe("sub1", "hash1") == "existing-job"

    @pytest.mark.asyncio
    async def test_set_and_delete(self):
        r = AsyncMock()
        q = RedisQueue(r)
        await q.set_dedupe("sub1", "hash1", "job-123")
        r.set.assert_called_once()
        await q.delete_dedupe("sub1", "hash1")
        r.delete.assert_called_once()
