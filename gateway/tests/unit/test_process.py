"""Unit tests for worker process logic — uses fakes, no patching except for canonize()."""

import os
from unittest.mock import AsyncMock, patch

import pytest

from app.context import Services
from app.crypto import encrypt
from app.process import dispatch_job
from app.protocols import Job, UserContext
from app.quota import QuotaService
from app.types import Markdown
from tests.fakes import (
    FakeBlobStore,
    FakeEmitter,
    FakeImageCaptioner,
    FakeJobStore,
    FakeOleConverter,
    FakeOoxmlExtractor,
    FakePageRenderer,
    FakePdfExtractor,
    FakeQueue,
    FakeRedis,
    FakeUserResolver,
)


def _make_svc():
    key = os.urandom(32)
    user = UserContext(user_id="user_1", encryption_key=key, price_per_unit=0.003, key_id="test")
    quota_redis = FakeRedis()
    emitter = FakeEmitter()
    svc = Services(
        blobs=FakeBlobStore(),
        jobs=FakeJobStore(),
        users=FakeUserResolver({"sub_1": user}),
        queue=FakeQueue(),
        quota=QuotaService(quota_redis),
        telemetry=emitter,
        captioner=FakeImageCaptioner(),
        pdf_extractor=FakePdfExtractor(),
        ole_converter=FakeOleConverter(),
        ooxml_extractor=FakeOoxmlExtractor(),
        page_renderer=FakePageRenderer(),
    )
    return svc, user, emitter


def _make_job(**overrides):
    defaults = dict(sub_id="sub_1", mime_type="text/plain", filename="test.txt", deadline_seconds=60.0)
    defaults.update(overrides)
    return Job.create(**defaults)


class TestProcessJob:
    @pytest.mark.asyncio
    async def test_successful_conversion(self):
        svc, user, emitter = _make_svc()
        job = _make_job()

        # Store encrypted input
        encrypted = encrypt(b"hello world", user.encryption_key)
        await svc.blobs.put(f"{user.user_id}/{job.job_id}/input.bin", encrypted)

        # Create job metadata (as gateway would)
        from app.protocols import JobMeta

        svc.jobs.create(JobMeta(user_id=user.user_id, job_id=job.job_id, sub_id="sub_1"))

        mock_result = Markdown("# Hello")

        with patch("app.process_canonize.canonize", new_callable=AsyncMock, return_value=mock_result):
            proc = await dispatch_job(job, user, svc)

        assert proc.job_result.status == "ok"
        assert proc.file_size == 11
        assert proc.doc_hash != ""

        # Job metadata updated
        meta = svc.jobs.get(job.job_id)
        assert meta is not None
        assert meta.status == "ok"
        assert meta.completed_at != ""
        assert meta.retention_expires != ""
        assert meta.artefacts != ""  # markdown artefact stored

        # Telemetry emitted
        assert len(emitter.events) == 1
        event = emitter.events[0]
        assert event.status == "ok"
        assert event.input_bytes == 11
        assert event.processing_ms > 0

    @pytest.mark.asyncio
    async def test_missing_input_blob(self):
        svc, user, emitter = _make_svc()
        job = _make_job()

        proc = await dispatch_job(job, user, svc)
        assert proc.job_result.status == "error"
        assert proc.job_result.status_code == 500
        assert "not found" in proc.job_result.detail.lower()

    @pytest.mark.asyncio
    async def test_unsupported_format(self):
        svc, user, emitter = _make_svc()
        job = _make_job(mime_type="video/mp4")

        encrypted = encrypt(b"fake video", user.encryption_key)
        await svc.blobs.put(f"{user.user_id}/{job.job_id}/input.bin", encrypted)
        svc.jobs.create(
            __import__("app.protocols", fromlist=["JobMeta"]).JobMeta(
                user_id=user.user_id, job_id=job.job_id, sub_id="sub_1"
            )
        )

        from app.errors import UnsupportedFormat

        with patch("app.process_canonize.canonize", new_callable=AsyncMock, side_effect=UnsupportedFormat("video/mp4")):
            proc = await dispatch_job(job, user, svc)

        assert proc.job_result.status == "error"
        assert proc.job_result.status_code == 400
        assert proc.file_size > 0

        # Job metadata updated to error
        meta = svc.jobs.get(job.job_id)
        assert meta is not None
        assert meta.status == "error"

    @pytest.mark.asyncio
    async def test_unexpected_exception(self):
        svc, user, emitter = _make_svc()
        job = _make_job()

        encrypted = encrypt(b"data", user.encryption_key)
        await svc.blobs.put(f"{user.user_id}/{job.job_id}/input.bin", encrypted)
        svc.jobs.create(
            __import__("app.protocols", fromlist=["JobMeta"]).JobMeta(
                user_id=user.user_id, job_id=job.job_id, sub_id="sub_1"
            )
        )

        with patch("app.process_canonize.canonize", new_callable=AsyncMock, side_effect=RuntimeError("boom")):
            proc = await dispatch_job(job, user, svc)

        assert proc.job_result.status == "error"
        assert proc.job_result.status_code == 500
        assert proc.job_result.detail == "boom"

        # Job metadata also records the real error
        meta = svc.jobs.get(job.job_id)
        assert meta is not None
        assert meta.detail == "[internal] boom"

        # Telemetry emitted with error details
        assert len(emitter.events) == 1
        event = emitter.events[0]
        assert event.status == "error"
        assert event.error == "boom"
