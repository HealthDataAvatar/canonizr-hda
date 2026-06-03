"""Tests that upstream service errors propagate correct error categories through the full pipeline.

These tests do NOT patch convert() — they let it run against fake services.
"""

import os

import pytest

from app.context import Services
from app.crypto import encrypt
from app.process import process_job
from app.protocols import Job, JobMeta, UserContext
from app.quota import QuotaService
from app.services.retry import TransientUpstreamError
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


def _make_svc(*, pdf_extractor=None, captioner=None, office_converter=None):
    key = os.urandom(32)
    user = UserContext(user_id="user_1", encryption_key=key, key_name="test")
    emitter = FakeEmitter()
    svc = Services(
        blobs=FakeBlobStore(),
        jobs=FakeJobStore(),
        users=FakeUserResolver({"sub_1": user}),
        queue=FakeQueue(),
        quota=QuotaService(FakeRedis()),
        telemetry=emitter,
        captioner=captioner or FakeCaptioner(),
        pdf_extractor=pdf_extractor or FakePdfExtractor(),
        office_converter=office_converter or FakeOfficeConverter(),
    )
    return svc, user, emitter


def _make_job(**overrides):
    defaults = dict(sub_id="sub_1", mime_type="text/plain", filename="test.txt", deadline_seconds=60.0)
    defaults.update(overrides)
    return Job.create(**defaults)


async def _seed_and_run(svc, user, job, file_bytes=b"hello"):
    encrypted = encrypt(file_bytes, user.encryption_key)
    await svc.blobs.put(f"{user.user_id}/{job.job_id}/input.bin", encrypted)
    svc.jobs.create(JobMeta(user_id=user.user_id, job_id=job.job_id, sub_id="sub_1"))
    return await process_job(job, user, svc)


class TestPdfExtractorErrors:
    @pytest.mark.asyncio
    async def test_transient_error_classifies_as_transient(self):
        fake_pdf = FakePdfExtractor(
            responses=[
                TransientUpstreamError("docling", 504, "service timeout"),
            ]
        )
        svc, user, _ = _make_svc(pdf_extractor=fake_pdf)
        job = _make_job(mime_type="application/pdf", filename="test.pdf")

        proc = await _seed_and_run(svc, user, job)

        assert proc.job_result.status == "error"
        assert proc.error_category == "transient"
        assert "504" in proc.job_result.detail

    @pytest.mark.asyncio
    async def test_success_returns_ok(self):
        fake_pdf = FakePdfExtractor(
            responses=[
                ("# Hello world", []),
            ]
        )
        svc, user, _ = _make_svc(pdf_extractor=fake_pdf, captioner=FakeCaptioner(available=False))
        job = _make_job(mime_type="application/pdf", filename="test.pdf")

        proc = await _seed_and_run(svc, user, job)

        assert proc.job_result.status == "ok"
        assert proc.error_category == ""


class TestCaptionerErrors:
    @pytest.mark.asyncio
    async def test_captioner_timeout_classifies_as_transient(self):
        """Image captioning timeout → transient error."""
        fake_cap = FakeCaptioner(
            responses=[
                TransientUpstreamError("captioning", 504, "service timeout"),
            ]
        )
        svc, user, _ = _make_svc(captioner=fake_cap)
        job = _make_job(mime_type="image/png", filename="test.png")

        proc = await _seed_and_run(svc, user, job)

        assert proc.job_result.status == "error"
        assert proc.error_category == "transient"

    @pytest.mark.asyncio
    async def test_captioner_unavailable_returns_permanent(self):
        """Captioning not configured → permanent (ServiceNotConfigured)."""
        fake_cap = FakeCaptioner(available=False)
        svc, user, _ = _make_svc(captioner=fake_cap)
        job = _make_job(mime_type="image/png", filename="test.png")

        proc = await _seed_and_run(svc, user, job)

        assert proc.job_result.status == "error"
        assert proc.error_category == "permanent"


class TestOfficeConverterErrors:
    @pytest.mark.asyncio
    async def test_gotenberg_timeout_classifies_as_transient(self):
        fake_office = FakeOfficeConverter(
            responses=[
                TransientUpstreamError("gotenberg", 504, "service timeout"),
            ]
        )
        svc, user, _ = _make_svc(office_converter=fake_office)
        job = _make_job(mime_type="application/msword", filename="test.doc")

        proc = await _seed_and_run(svc, user, job)

        assert proc.job_result.status == "error"
        assert proc.error_category == "transient"

    @pytest.mark.asyncio
    async def test_gotenberg_unavailable_returns_permanent(self):
        fake_office = FakeOfficeConverter(available=False)
        svc, user, _ = _make_svc(office_converter=fake_office)
        job = _make_job(mime_type="application/msword", filename="test.doc")

        proc = await _seed_and_run(svc, user, job)

        assert proc.job_result.status == "error"
        assert proc.error_category == "permanent"
