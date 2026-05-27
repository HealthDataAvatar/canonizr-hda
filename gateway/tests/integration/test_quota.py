"""Integration tests for quota enforcement — requires gateway + Redis."""
import os

import pytest
import redis
import requests

GATEWAY_URL = os.environ.get("GATEWAY_URL", "http://gateway:8000")
REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379")
TIMEOUT = 120


@pytest.fixture
def r():
    """Direct Redis connection for setting up quota state."""
    client = redis.from_url(REDIS_URL, decode_responses=True)
    yield client
    # Clean up all test keys
    for key in client.scan_iter("sub:test_*"):
        client.delete(key)
    client.close()


def _convert(file_bytes, filename="test.html", sub_id=None):
    headers = {}
    if sub_id:
        headers["X-Subscription-Id"] = sub_id
    return requests.post(
        f"{GATEWAY_URL}/convert",
        files={"file": (filename, file_bytes, "text/html")},
        headers=headers,
        timeout=TIMEOUT,
    )


class TestQuotaEnforcement:
    def test_no_quota_allows_request(self, r):
        resp = _convert(b"<p>hello</p>", sub_id="test_unlimited")
        assert resp.status_code == 200

    def test_under_quota_allows_request(self, r):
        r.set("sub:test_quota1:quota:bytes", "100000")
        r.set("sub:test_quota1:bytes", "1000")
        resp = _convert(b"<p>hello</p>", sub_id="test_quota1")
        assert resp.status_code == 200

    def test_over_quota_rejects(self, r):
        r.set("sub:test_quota2:quota:bytes", "100")
        r.set("sub:test_quota2:bytes", "100")
        resp = _convert(b"<p>hello</p>", sub_id="test_quota2")
        assert resp.status_code == 429

    def test_file_exceeds_remaining_quota_rejects(self, r):
        r.set("sub:test_quota3:quota:bytes", "100")
        r.set("sub:test_quota3:bytes", "90")
        # File is 12 bytes, remaining is 10
        resp = _convert(b"<p>hello</p>", sub_id="test_quota3")
        assert resp.status_code == 429

    def test_usage_increments_after_success(self, r):
        r.set("sub:test_quota4:quota:bytes", "100000")
        before = int(r.get("sub:test_quota4:bytes") or 0)
        resp = _convert(b"<p>hello</p>", sub_id="test_quota4")
        assert resp.status_code == 200
        after = int(r.get("sub:test_quota4:bytes") or 0)
        assert after > before

    def test_no_subscription_header_allows_request(self):
        resp = _convert(b"<p>hello</p>")
        assert resp.status_code == 200

    def test_repeated_rejections_block(self, r):
        r.set("sub:test_quota5:quota:bytes", "1")
        r.set("sub:test_quota5:bytes", "1")
        r.set("sub:test_quota5:rejected", "50")
        resp = _convert(b"<p>hello</p>", sub_id="test_quota5")
        assert resp.status_code == 429
        assert "try again later" in resp.json()["detail"].lower()
