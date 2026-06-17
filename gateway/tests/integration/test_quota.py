"""Integration tests for quota enforcement — requires gateway + Redis + Azurite.

Quota limits are set in Table Storage (source of truth). The gateway reads
from Redis cache first, falling back to Table Storage on cache miss.
Usage counters are period-scoped: sub:{sub_id}:bytes:{period_start}.
Tests cover both the Table-backed path and the natural exhaustion flow.
"""

import os

import pytest
import redis
from azure.data.tables import TableServiceClient

from app.quota import current_period_start

GATEWAY_URL = os.environ.get("GATEWAY_URL", "http://gateway:8000")
REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379")
AZURITE_TABLE_CONN = os.environ.get(
    "AZURITE_TABLE_CONN",
    "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;"
    "AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;"
    "TableEndpoint=http://azurite:10002/devstoreaccount1",
)
GW_SUBSCRIPTIONS = "GwSubscriptions"
TIMEOUT = 120

# All test users have billing_anchor_day=1 (default)
PS = current_period_start(1)


def _usage_key(sub_id: str) -> str:
    return f"sub:{sub_id}:bytes:{PS}"


@pytest.fixture
def r(test_sub):
    """Direct Redis connection. Cleans up quota keys after test."""
    client = redis.from_url(REDIS_URL, decode_responses=True)
    yield client
    for key in client.scan_iter(f"sub:{test_sub.sub_id}:*"):
        client.delete(key)
    for key in client.scan_iter(f"dedupe:{test_sub.sub_id}:*"):
        client.delete(key)
    client.close()


@pytest.fixture
def table():
    """Table Storage client for GwSubscriptions."""
    ts = TableServiceClient.from_connection_string(AZURITE_TABLE_CONN)
    return ts.get_table_client(GW_SUBSCRIPTIONS)


def _set_quota_in_table(table, sub_id: str, quota_bytes: int):
    """Set quota in Table Storage (source of truth) by merging into existing entity."""
    entity = table.get_entity("subscription", sub_id)
    entity["quota_bytes"] = quota_bytes
    table.upsert_entity(dict(entity))


def _convert(file_bytes, api_key):
    import requests as req

    return req.post(
        f"{GATEWAY_URL}/v1/canonize",
        files={"file": ("test.txt", file_bytes, "text/plain")},
        headers={"Authorization": f"Bearer {api_key}"},
        timeout=TIMEOUT,
    )


class TestQuotaEnforcement:
    def test_no_quota_allows_request(self, test_sub, r):
        """No quota_bytes in Table Storage -> unlimited."""
        resp = _convert(b"hello", test_sub.api_key)
        assert resp.status_code == 202

    def test_under_quota_allows_request(self, test_sub, r, table):
        """Quota set in Table Storage, usage well under limit."""
        _set_quota_in_table(table, test_sub.sub_id, 100_000)
        resp = _convert(b"hello", test_sub.api_key)
        assert resp.status_code == 202

    def test_over_quota_rejects(self, test_sub, r, table):
        """Usage already at limit -> 429."""
        _set_quota_in_table(table, test_sub.sub_id, 1)
        r.set(_usage_key(test_sub.sub_id), "1")
        resp = _convert(b"hello", test_sub.api_key)
        assert resp.status_code == 429

    def test_usage_increments_on_accept(self, test_sub, r, table):
        _set_quota_in_table(table, test_sub.sub_id, 100_000)
        before = int(r.get(_usage_key(test_sub.sub_id)) or 0)
        resp = _convert(b"hello", test_sub.api_key)
        assert resp.status_code == 202
        after = int(r.get(_usage_key(test_sub.sub_id)) or 0)
        assert after > before

    def test_repeated_rejections_block(self, test_sub, r, table):
        _set_quota_in_table(table, test_sub.sub_id, 1)
        r.set(_usage_key(test_sub.sub_id), "1")
        r.set(f"sub:{test_sub.sub_id}:rejected", "50")
        resp = _convert(b"hello", test_sub.api_key)
        assert resp.status_code == 429
        assert "try again later" in resp.json()["detail"].lower()

    def test_natural_quota_exhaustion(self, test_sub, r, table):
        """Submit files until quota is naturally consumed via the gateway."""
        _set_quota_in_table(table, test_sub.sub_id, 100)
        # First: 5 bytes
        resp1 = _convert(b"hello", test_sub.api_key)
        assert resp1.status_code == 202
        usage = int(r.get(_usage_key(test_sub.sub_id)) or 0)
        assert usage == 5
        # Fill up the rest
        resp2 = _convert(b"x" * 95, test_sub.api_key)
        assert resp2.status_code == 202
        # Now at 100/100 -- next request should be rejected
        resp3 = _convert(b"y", test_sub.api_key)
        assert resp3.status_code == 429

    def test_file_larger_than_total_quota(self, test_sub, r, table):
        """Upload a file larger than the entire quota from zero usage."""
        _set_quota_in_table(table, test_sub.sub_id, 10)
        resp = _convert(b"x" * 100, test_sub.api_key)
        assert resp.status_code == 429
        assert "file too large" in resp.json()["detail"].lower()
        # Usage should not have been recorded
        usage = int(r.get(_usage_key(test_sub.sub_id)) or 0)
        assert usage == 0

    def test_quota_loaded_from_table_on_cache_miss(self, test_sub, r, table):
        """Gateway should fall back to Table Storage when Redis has no cached limit."""
        _set_quota_in_table(table, test_sub.sub_id, 10)
        # Ensure no cached quota in Redis
        r.delete(f"sub:{test_sub.sub_id}:quota:bytes")
        # File is larger than quota -- should still be rejected via table fallback
        resp = _convert(b"x" * 100, test_sub.api_key)
        assert resp.status_code == 429
        # After the check, the limit should now be cached in Redis
        cached = r.get(f"sub:{test_sub.sub_id}:quota:bytes")
        assert cached is not None
        assert int(cached) == 10
