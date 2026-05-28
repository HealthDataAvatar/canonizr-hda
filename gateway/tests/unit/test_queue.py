"""Unit tests for the Redis Streams job queue — mocks Redis."""

from unittest.mock import AsyncMock

import pytest

from app.queue import (
    GROUP_NAME,
    STREAM_KEY,
    Job,
    JobResult,
    acknowledge,
    check_dedupe,
    dedupe_key,
    delete_dedupe,
    dequeue,
    enqueue,
    ensure_group,
    get_result,
    result_key,
    set_dedupe,
    store_result,
)


class TestJobSerialization:
    def test_to_fields_and_back(self):
        job = Job.create(
            sub_id="sub_1",
            mime_type="application/pdf",
            filename="test.pdf",
            deadline_seconds=60.0,
        )
        fields = job.to_fields()
        restored = Job.from_fields("1-0", fields)
        assert restored.job_id == job.job_id
        assert restored.stream_id == "1-0"
        assert restored.sub_id == "sub_1"
        assert restored.mime_type == "application/pdf"
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
        assert restored.status == "ok"

    def test_round_trip_error(self):
        result = JobResult(job_id="abc", status="error", error_detail="broke", status_code=502)
        restored = JobResult.deserialize(result.serialize())
        assert restored.error_detail == "broke"
        assert restored.status_code == 502


class TestEnsureGroup:
    @pytest.mark.asyncio
    async def test_creates_group(self):
        r = AsyncMock()
        await ensure_group(r)
        r.xgroup_create.assert_called_once_with(
            STREAM_KEY,
            GROUP_NAME,
            id="0",
            mkstream=True,
        )

    @pytest.mark.asyncio
    async def test_ignores_busygroup_error(self):
        import redis.asyncio as aioredis

        r = AsyncMock()
        r.xgroup_create.side_effect = aioredis.ResponseError("BUSYGROUP Consumer Group name already exists")
        await ensure_group(r)  # should not raise


class TestEnqueue:
    @pytest.mark.asyncio
    async def test_xadds_to_stream(self):
        r = AsyncMock()
        job = Job.create(sub_id="sub_1", mime_type="application/pdf", filename="test.pdf", deadline_seconds=60.0)
        result = await enqueue(r, job)
        assert result == job.job_id
        r.xadd.assert_called_once()
        args = r.xadd.call_args[0]
        assert args[0] == STREAM_KEY
        assert args[1]["job_id"] == job.job_id


class TestDequeue:
    @pytest.mark.asyncio
    async def test_reclaims_stale_jobs_first(self):
        r = AsyncMock()
        fields = Job.create(
            sub_id="sub_1", mime_type="text/plain", filename="test.txt", deadline_seconds=30.0
        ).to_fields()
        r.xautoclaim.return_value = ("0-0", [("1-1", fields)], [])
        result = await dequeue(r, timeout=5000)
        assert result is not None
        assert result.stream_id == "1-1"
        assert result.sub_id == "sub_1"
        r.xreadgroup.assert_not_called()

    @pytest.mark.asyncio
    async def test_reads_new_when_no_stale(self):
        r = AsyncMock()
        r.xautoclaim.return_value = ("0-0", [], [])
        fields = Job.create(
            sub_id="sub_1", mime_type="text/plain", filename="test.txt", deadline_seconds=30.0
        ).to_fields()
        r.xreadgroup.return_value = [[STREAM_KEY, [("2-0", fields)]]]
        result = await dequeue(r, timeout=5000)
        assert result is not None
        assert result.stream_id == "2-0"

    @pytest.mark.asyncio
    async def test_returns_none_on_timeout(self):
        r = AsyncMock()
        r.xautoclaim.return_value = ("0-0", [], [])
        r.xreadgroup.return_value = None
        result = await dequeue(r, timeout=1000)
        assert result is None


class TestAcknowledge:
    @pytest.mark.asyncio
    async def test_xacks_the_message(self):
        r = AsyncMock()
        job = Job(job_id="abc", stream_id="1-0", sub_id="s", mime_type="", filename="", deadline_seconds=0)
        await acknowledge(r, job)
        r.xack.assert_called_once_with(STREAM_KEY, GROUP_NAME, "1-0")


class TestStoreResult:
    @pytest.mark.asyncio
    async def test_stores_with_set(self):
        r = AsyncMock()
        result = JobResult(job_id="abc", status="ok", status_code=200)
        await store_result(r, "abc", result, ttl=60)
        r.set.assert_called_once_with(result_key("abc"), result.serialize(), ex=60)

    @pytest.mark.asyncio
    async def test_uses_correct_key_format(self):
        assert result_key("abc123") == "result:abc123"


class TestDeduplication:
    @pytest.mark.asyncio
    async def test_check_returns_none_on_miss(self):
        r = AsyncMock()
        r.get.return_value = None
        assert await check_dedupe(r, "sub1", "hash1") is None

    @pytest.mark.asyncio
    async def test_check_returns_job_id_on_hit(self):
        r = AsyncMock()
        r.get.return_value = "existing-job-id"
        result = await check_dedupe(r, "sub1", "hash1")
        assert result == "existing-job-id"
        r.get.assert_called_once_with(dedupe_key("sub1", "hash1"))

    @pytest.mark.asyncio
    async def test_set_stores_with_ttl(self):
        r = AsyncMock()
        await set_dedupe(r, "sub1", "hash1", "job-123", ttl=3600)
        r.set.assert_called_once_with(dedupe_key("sub1", "hash1"), "job-123", ex=3600)

    @pytest.mark.asyncio
    async def test_delete_removes_key(self):
        r = AsyncMock()
        await delete_dedupe(r, "sub1", "hash1")
        r.delete.assert_called_once_with(dedupe_key("sub1", "hash1"))

    def test_dedupe_key_format(self):
        assert dedupe_key("sub1", "abc123") == "dedupe:sub1:abc123"


class TestGetResult:
    @pytest.mark.asyncio
    async def test_returns_result(self):
        result = JobResult(job_id="abc", status="ok", status_code=200)
        r = AsyncMock()
        r.get.return_value = result.serialize()
        got = await get_result(r, "abc")
        assert got is not None
        r.get.assert_called_once_with(result_key("abc"))

    @pytest.mark.asyncio
    async def test_returns_none_when_missing(self):
        r = AsyncMock()
        r.get.return_value = None
        assert await get_result(r, "abc") is None


class TestFailureAndRecovery:
    @pytest.mark.asyncio
    async def test_unacked_job_is_reclaimable(self):
        r = AsyncMock()
        fields = Job.create(
            sub_id="sub_1", mime_type="text/plain", filename="test.txt", deadline_seconds=30.0
        ).to_fields()
        r.xautoclaim.return_value = ("0-0", [], [])
        r.xreadgroup.return_value = [[STREAM_KEY, [("1-0", fields)]]]
        job = await dequeue(r, timeout=5000)
        assert job is not None

        r.xautoclaim.return_value = ("0-0", [("1-0", fields)], [])
        recovered = await dequeue(r, timeout=5000)
        assert recovered is not None
        assert recovered.stream_id == "1-0"
        assert recovered.job_id == job.job_id

    @pytest.mark.asyncio
    async def test_acked_job_not_reclaimable(self):
        r = AsyncMock()
        fields = Job.create(
            sub_id="sub_1", mime_type="text/plain", filename="test.txt", deadline_seconds=30.0
        ).to_fields()
        r.xautoclaim.return_value = ("0-0", [], [])
        r.xreadgroup.return_value = [[STREAM_KEY, [("1-0", fields)]]]
        job = await dequeue(r, timeout=5000)
        assert job is not None
        await acknowledge(r, job)
        r.xack.assert_called_once_with(STREAM_KEY, GROUP_NAME, "1-0")

    @pytest.mark.asyncio
    async def test_result_survives_gateway_restart(self):
        r = AsyncMock()
        result = JobResult(job_id="abc", status="ok", status_code=200)
        await store_result(r, "abc", result, ttl=300)
        r.set.assert_called_once()
        r.get.return_value = result.serialize()
        polled = await get_result(r, "abc")
        assert polled is not None
        assert polled.status == "ok"

    @pytest.mark.asyncio
    async def test_result_expires_after_ttl(self):
        r = AsyncMock()
        result = JobResult(job_id="abc", status="ok", status_code=200)
        await store_result(r, "abc", result, ttl=60)
        r.set.assert_called_once_with(result_key("abc"), result.serialize(), ex=60)
        r.get.return_value = None
        assert await get_result(r, "abc") is None
