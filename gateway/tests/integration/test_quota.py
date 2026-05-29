"""Integration tests for quota enforcement — requires gateway + Redis."""

import os

import pytest
import redis
import requests

GATEWAY_URL = os.environ.get("GATEWAY_URL", "http://gateway:8000")
REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379")
TIMEOUT = 120


@pytest.fixture
def r(test_sub):
    """Direct Redis connection for setting up quota state. Cleans up after test."""
    client = redis.from_url(REDIS_URL, decode_responses=True)
    yield client
    for key in client.scan_iter(f"sub:{test_sub}:*"):
        client.delete(key)
    for key in client.scan_iter(f"dedupe:{test_sub}:*"):
        client.delete(key)
    client.close()


def _convert(file_bytes, sub_id):
    return requests.post(
        f"{GATEWAY_URL}/v1/jobs",
        files={"file": ("test.txt", file_bytes, "text/plain")},
        headers={"X-Subscription-Id": sub_id},
        timeout=TIMEOUT,
    )


class TestQuotaEnforcement:
    def test_no_quota_allows_request(self, test_sub, r):
        resp = _convert(b"hello", test_sub)
        assert resp.status_code == 202

    def test_under_quota_allows_request(self, test_sub, r):
        r.set(f"sub:{test_sub}:quota:bytes", "100000")
        r.set(f"sub:{test_sub}:bytes", "1000")
        resp = _convert(b"hello", test_sub)
        assert resp.status_code == 202

    def test_over_quota_rejects(self, test_sub, r):
        r.set(f"sub:{test_sub}:quota:bytes", "1")
        r.set(f"sub:{test_sub}:bytes", "1")
        resp = _convert(b"hello", test_sub)
        assert resp.status_code == 429

    def test_usage_increments_on_accept(self, test_sub, r):
        r.set(f"sub:{test_sub}:quota:bytes", "100000")
        before = int(r.get(f"sub:{test_sub}:bytes") or 0)
        resp = _convert(b"hello", test_sub)
        assert resp.status_code == 202
        after = int(r.get(f"sub:{test_sub}:bytes") or 0)
        assert after > before

    def test_repeated_rejections_block(self, test_sub, r):
        r.set(f"sub:{test_sub}:quota:bytes", "1")
        r.set(f"sub:{test_sub}:bytes", "1")
        r.set(f"sub:{test_sub}:rejected", "50")
        resp = _convert(b"hello", test_sub)
        assert resp.status_code == 429
        assert "try again later" in resp.json()["detail"].lower()
