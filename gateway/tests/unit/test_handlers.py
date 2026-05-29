"""Unit tests for request handlers — uses fakes, no patching, no FastAPI."""

import json
import os

import pytest

from app.context import Services
from app.crypto import encrypt
from app.handlers import AcceptResult, Rejected, accept_job, delete_result, poll_result
from app.keys import quota_limit, quota_usage
from app.protocols import JobResult, UserContext
from app.quota import QuotaService
from tests.fakes import FakeBlobStore, FakeJobStore, FakeQueue, FakeRedis, FakeUserResolver


def _make_user(user_id="user_1", sub_id="sub_1"):
    key = os.urandom(32)
    return sub_id, UserContext(user_id=user_id, encryption_key=key, key_name="test-key")


def _make_svc(sub_id="sub_1", user_id="user_1"):
    sub_id, user = _make_user(user_id, sub_id)
    quota_redis = FakeRedis()
    return (
        Services(
            blobs=FakeBlobStore(),
            jobs=FakeJobStore(),
            users=FakeUserResolver({sub_id: user}),
            queue=FakeQueue(),
            quota=QuotaService(quota_redis, max_rejected=3),
        ),
        user,
        quota_redis,
    )


class TestAcceptJob:
    @pytest.mark.asyncio
    async def test_accepts_and_returns_job_id(self):
        svc, _, _ = _make_svc()
        result = await accept_job(b"hello", "test.txt", "text/plain", "sub_1", svc)
        assert isinstance(result, AcceptResult)
        assert result.job_id
        assert result.estimated_seconds > 0
        assert not result.deduplicated

    @pytest.mark.asyncio
    async def test_writes_blob_and_metadata(self):
        svc, user, _ = _make_svc()
        result = await accept_job(b"hello", "test.txt", "text/plain", "sub_1", svc)
        blob_key = f"{user.user_id}/{result.job_id}/input.bin"
        assert await svc.blobs.get(blob_key) is not None
        meta = svc.jobs.get(user.user_id, result.job_id)
        assert meta is not None
        assert meta.status == "processing"
        assert meta.original_filename == "test.txt"

    @pytest.mark.asyncio
    async def test_enqueues_job(self):
        svc, _, _ = _make_svc()
        await accept_job(b"hello", "test.txt", "text/plain", "sub_1", svc)
        # Job should be dequeueable from the queue
        job = await svc.queue.dequeue(timeout=0)
        assert job is not None

    @pytest.mark.asyncio
    async def test_dedup_returns_same_job_id(self):
        svc, _, _ = _make_svc()
        r1 = await accept_job(b"hello", "test.txt", "text/plain", "sub_1", svc)
        r2 = await accept_job(b"hello", "test.txt", "text/plain", "sub_1", svc)
        assert r2.job_id == r1.job_id
        assert r2.deduplicated

    @pytest.mark.asyncio
    async def test_different_files_get_different_jobs(self):
        svc, _, _ = _make_svc()
        r1 = await accept_job(b"hello", "a.txt", "text/plain", "sub_1", svc)
        r2 = await accept_job(b"world", "b.txt", "text/plain", "sub_1", svc)
        assert r1.job_id != r2.job_id

    @pytest.mark.asyncio
    async def test_unknown_subscription_rejected(self):
        svc, _, _ = _make_svc()
        with pytest.raises(Rejected, match="Unknown subscription"):
            await accept_job(b"hello", "test.txt", "text/plain", "unknown_sub", svc)

    @pytest.mark.asyncio
    async def test_unsupported_mime_rejected(self):
        svc, _, _ = _make_svc()
        with pytest.raises(Rejected, match="Unsupported"):
            await accept_job(b"hello", "test.bin", "application/octet-stream", "sub_1", svc)

    @pytest.mark.asyncio
    async def test_quota_exceeded_rejected(self):
        svc, _, quota_redis = _make_svc()
        quota_redis.seed(quota_limit(sub_id="sub_1"), "10")
        quota_redis.seed(quota_usage(sub_id="sub_1"), "10")
        with pytest.raises(Rejected) as exc_info:
            await accept_job(b"hello", "test.txt", "text/plain", "sub_1", svc)
        assert exc_info.value.status_code == 429

    @pytest.mark.asyncio
    async def test_quota_recorded_on_accept(self):
        svc, _, quota_redis = _make_svc()
        quota_redis.seed(quota_limit(sub_id="sub_1"), "100000")
        await accept_job(b"hello world", "test.txt", "text/plain", "sub_1", svc)
        usage = int(quota_redis._data.get("sub:sub_1:bytes", "0"))
        assert usage == 11

    @pytest.mark.asyncio
    async def test_sanitizes_filename(self):
        svc, user, _ = _make_svc()
        result = await accept_job(b"data", "../../etc/passwd", "text/plain", "sub_1", svc)
        meta = svc.jobs.get(user.user_id, result.job_id)
        assert meta is not None
        assert meta.original_filename == "passwd"


class TestPollResult:
    @pytest.mark.asyncio
    async def test_processing_returns_202(self):
        svc, _, _ = _make_svc()
        result = await accept_job(b"hello", "test.txt", "text/plain", "sub_1", svc)
        poll = await poll_result(result.job_id, svc)
        assert poll.status == "processing"
        assert poll.status_code == 202

    @pytest.mark.asyncio
    async def test_unknown_job_returns_202(self):
        svc, _, _ = _make_svc()
        poll = await poll_result("nonexistent", svc)
        assert poll.status_code == 202

    @pytest.mark.asyncio
    async def test_completed_job_returns_200(self):
        svc, user, _ = _make_svc()
        result = await accept_job(b"hello", "test.txt", "text/plain", "sub_1", svc)

        # Simulate worker completing the job
        from datetime import UTC, datetime, timedelta

        payload = json.dumps(
            {"markdown": "# Hello", "metadata": {"input_bytes": 5, "actions": ["passthrough"], "captioning": {}}}
        )
        encrypted = encrypt(payload.encode(), user.encryption_key)
        await svc.blobs.put(f"{user.user_id}/{result.job_id}/output.bin", encrypted)

        meta = svc.jobs.get(user.user_id, result.job_id)
        assert meta is not None
        meta.status = "ok"
        meta.completed_at = datetime.now(UTC).isoformat()
        meta.retention_expires = (datetime.now(UTC) + timedelta(hours=24)).isoformat()
        svc.jobs.update(meta)

        await svc.queue.store_result(result.job_id, JobResult(job_id=result.job_id, status="ok", status_code=200))

        poll = await poll_result(result.job_id, svc)
        assert poll.status == "ok"
        assert poll.status_code == 200
        assert poll.body is not None
        assert poll.body["markdown"] == "# Hello"

    @pytest.mark.asyncio
    async def test_deleted_job_returns_410(self):
        svc, user, _ = _make_svc()
        result = await accept_job(b"hello", "test.txt", "text/plain", "sub_1", svc)
        meta = svc.jobs.get(user.user_id, result.job_id)
        assert meta is not None
        meta.deleted = True
        svc.jobs.update(meta)

        await svc.queue.store_result(result.job_id, JobResult(job_id=result.job_id, status="ok", status_code=200))

        poll = await poll_result(result.job_id, svc)
        assert poll.status_code == 410

    @pytest.mark.asyncio
    async def test_error_job_returns_500(self):
        svc, _, _ = _make_svc()
        result = await accept_job(b"hello", "test.txt", "text/plain", "sub_1", svc)
        await svc.queue.store_result(
            result.job_id, JobResult(job_id=result.job_id, status="error", error_detail="boom", status_code=500)
        )

        poll = await poll_result(result.job_id, svc)
        assert poll.status_code == 500
        assert poll.body is not None
        assert "boom" in poll.body["detail"]


class TestDeleteResult:
    @pytest.mark.asyncio
    async def test_deletes_blobs_and_marks_deleted(self):
        svc, user, _ = _make_svc()
        result = await accept_job(b"hello", "test.txt", "text/plain", "sub_1", svc)
        await svc.blobs.put(f"{user.user_id}/{result.job_id}/output.bin", b"output")

        found = await delete_result(result.job_id, "sub_1", svc)
        assert found

        assert await svc.blobs.get(f"{user.user_id}/{result.job_id}/input.bin") is None
        assert await svc.blobs.get(f"{user.user_id}/{result.job_id}/output.bin") is None

        meta = svc.jobs.get(user.user_id, result.job_id)
        assert meta is not None
        assert meta.deleted

    @pytest.mark.asyncio
    async def test_unknown_job_returns_false(self):
        svc, _, _ = _make_svc()
        found = await delete_result("nonexistent", "sub_1", svc)
        assert not found

    @pytest.mark.asyncio
    async def test_wrong_user_rejected(self):
        svc, _, _ = _make_svc()
        other_key = os.urandom(32)
        from tests.fakes import FakeUserResolver

        assert isinstance(svc.users, FakeUserResolver)
        svc.users.add("sub_other", UserContext(user_id="user_other", encryption_key=other_key))

        result = await accept_job(b"hello", "test.txt", "text/plain", "sub_1", svc)

        with pytest.raises(Rejected, match="does not belong"):
            await delete_result(result.job_id, "sub_other", svc)

    @pytest.mark.asyncio
    async def test_unknown_subscription_rejected(self):
        svc, _, _ = _make_svc()
        result = await accept_job(b"hello", "test.txt", "text/plain", "sub_1", svc)
        with pytest.raises(Rejected, match="Unknown subscription"):
            await delete_result(result.job_id, "unknown_sub", svc)
