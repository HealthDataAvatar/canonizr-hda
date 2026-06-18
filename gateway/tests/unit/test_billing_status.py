"""Unit tests for billing status checks in handlers and user resolver."""

import os

import pytest

from app.context import Services
from app.handlers import Rejected, accept_canonize
from app.protocols import ResolveRejected, UserContext
from app.quota import QuotaService
from tests.fakes import (
    FakeBlobStore,
    FakeEmitter,
    FakeImageCaptioner,
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


def _make_svc(resolver_result):
    """Create Services with a user resolver that returns the given result."""
    return Services(
        blobs=FakeBlobStore(),
        jobs=FakeJobStore(),
        users=FakeUserResolver({"sub_1": resolver_result}),
        queue=FakeQueue(),
        quota=QuotaService(FakeRedis(), max_rejected=3),
        telemetry=FakeEmitter(),
        captioner=FakeImageCaptioner(),
        pdf_text_extractor=FakePdfTextExtractor(),
        pdf_image_extractor=FakeImageExtractor(),
        pdf_table_extractor=FakeTableExtractor(),
        ole_converter=FakeOleConverter(),
        ooxml_extractor=FakeOoxmlExtractor(),
        page_renderer=FakePageRenderer(),
    )


class TestBillingRejection:
    """Billing error strings (BILLING: prefix) should produce 402."""

    @pytest.mark.asyncio
    async def test_past_due_returns_402(self):
        svc = _make_svc(ResolveRejected("Payment failed — update your payment method", 402))
        with pytest.raises(Rejected) as exc_info:
            await accept_canonize(b"hello", "test.txt", "text/plain", "sub_1", svc)
        assert exc_info.value.status_code == 402
        assert "Payment failed" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_canceled_returns_402(self):
        svc = _make_svc(ResolveRejected("Subscription canceled — please resubscribe", 402))
        with pytest.raises(Rejected) as exc_info:
            await accept_canonize(b"hello", "test.txt", "text/plain", "sub_1", svc)
        assert exc_info.value.status_code == 402

    @pytest.mark.asyncio
    async def test_free_exhausted_returns_402(self):
        svc = _make_svc(ResolveRejected("Free tier exhausted — add a payment method", 402))
        with pytest.raises(Rejected) as exc_info:
            await accept_canonize(b"hello", "test.txt", "text/plain", "sub_1", svc)
        assert exc_info.value.status_code == 402

    @pytest.mark.asyncio
    async def test_blocked_returns_403(self):
        svc = _make_svc(ResolveRejected("Account is blocked", 403))
        with pytest.raises(Rejected) as exc_info:
            await accept_canonize(b"hello", "test.txt", "text/plain", "sub_1", svc)
        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_active_user_proceeds(self):
        key = os.urandom(32)
        user = UserContext(user_id="user_1", encryption_key=key, price_per_unit=0.003, key_id="test-key")
        svc = _make_svc(user)
        result = await accept_canonize(b"hello", "test.txt", "text/plain", "sub_1", svc)
        assert result.job_id
