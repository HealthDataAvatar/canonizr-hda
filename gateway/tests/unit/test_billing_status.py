"""Unit tests for billing status checks in handlers and user resolver."""

import os

import pytest

from app.context import Services
from app.handlers import Rejected, accept_job
from app.protocols import UserContext
from app.quota import QuotaService
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


def _make_svc(resolver_result):
    """Create Services with a user resolver that returns the given result."""
    return Services(
        blobs=FakeBlobStore(),
        jobs=FakeJobStore(),
        users=FakeUserResolver({"sub_1": resolver_result}),
        queue=FakeQueue(),
        quota=QuotaService(FakeRedis(), max_rejected=3),
        telemetry=FakeEmitter(),
        captioner=FakeCaptioner(),
        pdf_extractor=FakePdfExtractor(),
        office_converter=FakeOfficeConverter(),
    )


class TestBillingRejection:
    """Billing error strings (BILLING: prefix) should produce 402."""

    @pytest.mark.asyncio
    async def test_past_due_returns_402(self):
        svc = _make_svc("BILLING:Payment failed — update your payment method")
        with pytest.raises(Rejected) as exc_info:
            await accept_job(b"hello", "test.txt", "text/plain", "sub_1", svc)
        assert exc_info.value.status_code == 402
        assert "Payment failed" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_canceled_returns_402(self):
        svc = _make_svc("BILLING:Subscription canceled — please resubscribe")
        with pytest.raises(Rejected) as exc_info:
            await accept_job(b"hello", "test.txt", "text/plain", "sub_1", svc)
        assert exc_info.value.status_code == 402

    @pytest.mark.asyncio
    async def test_free_exhausted_returns_402(self):
        svc = _make_svc("BILLING:Free tier exhausted — add a payment method")
        with pytest.raises(Rejected) as exc_info:
            await accept_job(b"hello", "test.txt", "text/plain", "sub_1", svc)
        assert exc_info.value.status_code == 402

    @pytest.mark.asyncio
    async def test_non_billing_error_returns_403(self):
        svc = _make_svc("Account is blocked")
        with pytest.raises(Rejected) as exc_info:
            await accept_job(b"hello", "test.txt", "text/plain", "sub_1", svc)
        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_active_user_proceeds(self):
        key = os.urandom(32)
        user = UserContext(user_id="user_1", encryption_key=key, key_name="test-key")
        svc = _make_svc(user)
        result = await accept_job(b"hello", "test.txt", "text/plain", "sub_1", svc)
        assert result.job_id
