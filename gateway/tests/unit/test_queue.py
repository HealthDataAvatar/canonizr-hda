"""Unit tests for the Redis Streams job queue — mocks Redis."""

from unittest.mock import AsyncMock, patch

import pytest

from app.queue import (
    GROUP_NAME,
    STREAM_KEY,
    Job,
    JobResult,
    acknowledge,
    await_result,
    dequeue,
    enqueue,
    ensure_group,
    get_result,
    result_key,
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
        """If a crashed worker left a pending job, XAUTOCLAIM picks it up."""
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
        """Normal path — no stale jobs, reads new from stream."""
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


class TestAwaitResult:
    @pytest.mark.asyncio
    async def test_returns_result_on_first_poll(self):
        """Result already available — returns immediately."""
        result = JobResult(job_id="abc", status="ok", status_code=200)
        r = AsyncMock()
        r.get.return_value = result.serialize()
        got = await await_result(r, "abc", timeout=10)
        assert got is not None
        assert got.status == "ok"
        assert r.get.call_count == 1

    @pytest.mark.asyncio
    async def test_returns_result_after_polling(self):
        """Result appears after a few polls."""
        result = JobResult(job_id="abc", status="ok", status_code=200)
        r = AsyncMock()
        r.get.side_effect = [None, None, result.serialize()]
        with patch("app.queue.asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            got = await await_result(r, "abc", timeout=10)
        assert got is not None
        assert got.status == "ok"
        assert r.get.call_count == 3
        assert mock_sleep.call_count == 2

    @pytest.mark.asyncio
    async def test_returns_none_on_timeout(self):
        """Result never appears — returns None after timeout."""
        r = AsyncMock()
        r.get.return_value = None
        with patch("app.queue.asyncio.sleep", new_callable=AsyncMock):
            got = await await_result(r, "abc", timeout=1.0)
        assert got is None

    @pytest.mark.asyncio
    async def test_polls_at_correct_interval(self):
        """Verify sleep is called with POLL_INTERVAL."""
        from app.queue import POLL_INTERVAL

        r = AsyncMock()
        r.get.return_value = None
        with patch("app.queue.asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            await await_result(r, "abc", timeout=1.0)
        for call in mock_sleep.call_args_list:
            assert call[0][0] == POLL_INTERVAL

    @pytest.mark.asyncio
    async def test_redis_error_during_poll_propagates(self):
        """If Redis raises during polling, the error should propagate."""
        import redis.asyncio as aioredis

        r = AsyncMock()
        r.get.side_effect = aioredis.ConnectionError("lost connection")
        with pytest.raises(aioredis.ConnectionError):
            await await_result(r, "abc", timeout=10)


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
    """Tests simulating worker crashes and job recovery."""

    @pytest.mark.asyncio
    async def test_unacked_job_is_reclaimable(self):
        """Worker dequeues but crashes before ACK — job stays in PEL.
        Another worker reclaims it via XAUTOCLAIM."""
        r = AsyncMock()

        fields = Job.create(
            sub_id="sub_1", mime_type="text/plain", filename="test.txt", deadline_seconds=30.0
        ).to_fields()
        r.xautoclaim.return_value = ("0-0", [], [])
        r.xreadgroup.return_value = [[STREAM_KEY, [("1-0", fields)]]]
        job = await dequeue(r, timeout=5000)
        assert job is not None

        # Worker "crashes" — no ACK called
        # Second worker starts and finds the stale job via XAUTOCLAIM
        r.xautoclaim.return_value = ("0-0", [("1-0", fields)], [])
        recovered = await dequeue(r, timeout=5000)
        assert recovered is not None
        assert recovered.stream_id == "1-0"
        assert recovered.job_id == job.job_id

    @pytest.mark.asyncio
    async def test_acked_job_not_reclaimable(self):
        """After ACK, job should not appear in XAUTOCLAIM results."""
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
        """Result stored via SET persists. If gateway restarts, it polls via GET."""
        r = AsyncMock()
        result = JobResult(job_id="abc", status="ok", status_code=200)

        # Worker stores result
        await store_result(r, "abc", result, ttl=300)
        r.set.assert_called_once()

        # Gateway restarts — polls instead of BLPOP
        r.get.return_value = result.serialize()
        polled = await get_result(r, "abc")
        assert polled is not None
        assert polled.status == "ok"

    @pytest.mark.asyncio
    async def test_result_expires_after_ttl(self):
        """store_result sets a TTL — after expiry, get_result returns None."""
        r = AsyncMock()
        result = JobResult(job_id="abc", status="ok", status_code=200)
        await store_result(r, "abc", result, ttl=60)
        # Verify TTL was set
        r.set.assert_called_once_with(result_key("abc"), result.serialize(), ex=60)

        # Simulate TTL expiry
        r.get.return_value = None
        assert await get_result(r, "abc") is None
