"""Unit tests for the worker job handler — quota refund on failure."""

import asyncio
import os

import pytest

from app.context import Services
from app.keys import quota_usage
from app.protocols import JobMeta, JobStatus, UserContext
from app.quota import QuotaService, current_period_start
from app.worker import MAX_DELIVERIES, _handle_job
from tests.fakes import (
    FakeBlobStore,
    FakeEmitter,
    FakeImageExtractor,
    FakeJobStore,
    FakeOleConverter,
    FakeOoxmlExtractor,
    FakePageRenderer,
    FakePdfTextExtractor,
    FakeQueue,
    FakeRedis,
    FakeUserResolver,
)
from tests.unit.test_process import _make_job


def _make_svc():
    key = os.urandom(32)
    user = UserContext(user_id="user_1", encryption_key=key, price_per_unit=0.003, key_id="test")
    quota_redis = FakeRedis()
    svc = Services(
        blobs=FakeBlobStore(),
        jobs=FakeJobStore(),
        users=FakeUserResolver({"sub_1": user}),
        queue=FakeQueue(),
        quota=QuotaService(quota_redis),
        telemetry=FakeEmitter(),
        pdf_text_extractor=FakePdfTextExtractor(),
        pdf_image_extractor=FakeImageExtractor(),
        ole_converter=FakeOleConverter(),
        ooxml_extractor=FakeOoxmlExtractor(),
        page_renderer=FakePageRenderer(),
    )
    return svc, user, quota_redis


@pytest.mark.asyncio
async def test_refunds_charged_quota_on_early_failure():
    """Regression: a job charged at accept that fails BEFORE producing a
    file_size (missing/undecryptable input) must still be refunded."""
    svc, user, quota_redis = _make_svc()
    ps = current_period_start(user.billing_anchor_day)
    job = _make_job()

    # Gateway charged 1000 bytes at accept and recorded period_start on the job.
    await svc.quota.record("sub_1", "user_1", 1000, ps)
    svc.jobs.create(JobMeta(user_id=user.user_id, job_id=job.job_id, sub_id="sub_1", input_bytes=1000, period_start=ps))

    # No input blob exists -> process_canonize returns error with file_size=0.
    sem = asyncio.Semaphore(1)
    await sem.acquire()
    await _handle_job(job, svc, sem)

    # Charge was fully refunded against the same period it landed in.
    assert int(quota_redis._data.get(quota_usage(sub_id="sub_1", period_start=ps), "0")) == 0


@pytest.mark.asyncio
async def test_no_refund_when_nothing_charged():
    """A job with input_bytes=0 (nothing charged) triggers no decrement."""
    svc, user, quota_redis = _make_svc()
    ps = current_period_start(user.billing_anchor_day)
    job = _make_job()
    svc.jobs.create(JobMeta(user_id=user.user_id, job_id=job.job_id, sub_id="sub_1", input_bytes=0, period_start=ps))

    sem = asyncio.Semaphore(1)
    await sem.acquire()
    await _handle_job(job, svc, sem)

    # Key never created -> no negative counter.
    assert quota_usage(sub_id="sub_1", period_start=ps) not in quota_redis._data


@pytest.mark.asyncio
async def test_poison_job_is_dead_lettered():
    """A reclaimed job redelivered past MAX_DELIVERIES is abandoned, not reprocessed."""
    svc, user, _ = _make_svc()
    job = _make_job()
    job.reclaimed = True
    job.delivery_count = MAX_DELIVERIES + 1
    svc.jobs.create(JobMeta(user_id=user.user_id, job_id=job.job_id, sub_id="sub_1", status=JobStatus.PROCESSING))
    # No input blob exists: had it been dispatched, the error detail would be
    # "Decryption failed", not the poison "abandoned" message — so detail proves it was skipped.

    sem = asyncio.Semaphore(1)
    await sem.acquire()
    await _handle_job(job, svc, sem)

    result = await svc.queue.get_result(job.job_id)
    assert result is not None and result.status == "error"
    assert "abandoned" in result.detail
    meta = svc.jobs.get(job.job_id)
    assert meta is not None and meta.status == JobStatus.ERROR
    assert "[poison]" in meta.detail


@pytest.mark.asyncio
async def test_outer_crash_leaves_processing_and_does_not_ack():
    """A crash outside dispatch_job (here: resolve raising) must NOT ack and must NOT
    go terminal — the job stays PROCESSING for redelivery. Only the poison-pill path
    (redeliveries exhausted) marks it ERROR."""
    svc, user, _ = _make_svc()
    job = _make_job()
    svc.jobs.create(JobMeta(user_id=user.user_id, job_id=job.job_id, sub_id="sub_1", status=JobStatus.PROCESSING))

    async def _boom(sub_id: str):
        raise RuntimeError("resolver down")

    svc.users.resolve = _boom  # type: ignore[method-assign]
    acked: list[str] = []
    svc.queue.acknowledge = lambda job: acked.append(job.job_id) or asyncio.sleep(0)  # type: ignore[method-assign]

    sem = asyncio.Semaphore(1)
    await sem.acquire()
    await _handle_job(job, svc, sem)

    meta = svc.jobs.get(job.job_id)
    assert meta is not None and meta.status == JobStatus.PROCESSING  # honest: still queued for retry
    assert acked == []  # not acked -> left for redelivery


@pytest.mark.asyncio
async def test_reclaimed_job_under_cap_is_processed_normally():
    """A reclaimed job within the delivery cap is NOT dead-lettered."""
    svc, user, _ = _make_svc()
    job = _make_job()
    job.reclaimed = True
    job.delivery_count = MAX_DELIVERIES  # at the cap, not over it
    svc.jobs.create(JobMeta(user_id=user.user_id, job_id=job.job_id, sub_id="sub_1", status=JobStatus.PROCESSING))

    sem = asyncio.Semaphore(1)
    await sem.acquire()
    await _handle_job(job, svc, sem)

    # Dispatched (no input blob -> decrypt error), NOT the poison message.
    result = await svc.queue.get_result(job.job_id)
    assert result is not None and result.status == "error"
    assert "abandoned" not in result.detail
