"""Tests that upstream service errors propagate correct error categories through the full pipeline.

These tests do NOT patch convert() — they let it run against fake services.
"""

import os

import pytest

from app.context import Services
from app.crypto import encrypt
from app.process import dispatch_job
from app.protocols import Job, JobMeta, UserContext
from app.quota import QuotaService
from app.services.retry import TransientUpstreamError
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
    FakeTableExtractor,
    FakeUserResolver,
)


def _make_svc(*, pdf_text_extractor=None, ole_converter=None):
    key = os.urandom(32)
    user = UserContext(user_id="user_1", encryption_key=key, price_per_unit=0.003, key_id="test")
    emitter = FakeEmitter()
    svc = Services(
        blobs=FakeBlobStore(),
        jobs=FakeJobStore(),
        users=FakeUserResolver({"sub_1": user}),
        queue=FakeQueue(),
        quota=QuotaService(FakeRedis()),
        telemetry=emitter,
        pdf_text_extractor=pdf_text_extractor or FakePdfTextExtractor(),
        pdf_image_extractor=FakeImageExtractor(),
        pdf_table_extractor=FakeTableExtractor(),
        ole_converter=ole_converter or FakeOleConverter(),
        ooxml_extractor=FakeOoxmlExtractor(),
        page_renderer=FakePageRenderer(),
    )
    return svc, user, emitter


def _make_job(**overrides):
    defaults = dict(sub_id="sub_1", mime_type="text/plain", filename="test.txt", deadline_seconds=60.0)
    defaults.update(overrides)
    return Job.create(**defaults)


def _tiny_png() -> bytes:
    """Generate a minimal valid 1x1 PNG."""
    from io import BytesIO

    from PIL import Image

    buf = BytesIO()
    Image.new("RGB", (1, 1), "red").save(buf, format="PNG")
    return buf.getvalue()


async def _seed_and_run(svc, user, job, file_bytes=None):
    if file_bytes is None:
        file_bytes = _tiny_png() if job.mime_type.startswith("image/") else b"hello"
    encrypted = encrypt(file_bytes, user.encryption_key)
    await svc.blobs.put(f"{user.user_id}/{job.job_id}/input.bin", encrypted)
    svc.jobs.create(JobMeta(user_id=user.user_id, job_id=job.job_id, sub_id="sub_1"))
    return await dispatch_job(job, user, svc)


class TestPdfTextExtractorErrors:
    @pytest.mark.asyncio
    async def test_transient_error_classifies_as_transient(self):
        fake_pdf = FakePdfTextExtractor(
            responses=[
                TransientUpstreamError("liteparse", 504, "service timeout"),
            ]
        )
        svc, user, _ = _make_svc(pdf_text_extractor=fake_pdf)
        job = _make_job(mime_type="application/pdf", filename="test.pdf")

        proc = await _seed_and_run(svc, user, job)

        assert proc.job_result.status == "error"
        assert proc.error_category == "transient"
        assert "504" in proc.job_result.detail

    @pytest.mark.asyncio
    async def test_success_returns_ok(self):
        from app.types import Markdown

        fake_pdf = FakePdfTextExtractor(
            responses=[
                Markdown("# Hello world"),
            ]
        )
        svc, user, _ = _make_svc(pdf_text_extractor=fake_pdf)
        job = _make_job(mime_type="application/pdf", filename="test.pdf")

        proc = await _seed_and_run(svc, user, job)

        assert proc.job_result.status == "ok"
        assert proc.error_category == ""


class TestOfficeConverterErrors:
    @pytest.mark.asyncio
    async def test_gotenberg_timeout_classifies_as_transient(self):
        fake_office = FakeOleConverter(
            responses=[
                TransientUpstreamError("gotenberg", 504, "service timeout"),
            ]
        )
        svc, user, _ = _make_svc(ole_converter=fake_office)
        job = _make_job(mime_type="application/msword", filename="test.doc")

        proc = await _seed_and_run(svc, user, job)

        assert proc.job_result.status == "error"
        assert proc.error_category == "transient"

    @pytest.mark.asyncio
    async def test_gotenberg_unavailable_returns_permanent(self):
        fake_office = FakeOleConverter(available=False)
        svc, user, _ = _make_svc(ole_converter=fake_office)
        job = _make_job(mime_type="application/msword", filename="test.doc")

        proc = await _seed_and_run(svc, user, job)

        assert proc.job_result.status == "error"
        assert proc.error_category == "permanent"
