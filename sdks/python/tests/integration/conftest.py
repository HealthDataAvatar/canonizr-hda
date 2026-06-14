"""Fixtures for SDK integration tests.

Runs inside docker-compose.sdk-test.yml alongside gateway, worker, azurite, redis.
Connection strings and URLs come from environment variables set in the compose file.

Seeds a fresh API key per test into Azurite, same pattern as gateway integration tests.
"""

from __future__ import annotations

import hashlib
import os
import secrets
import time
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

import pytest
from azure.data.tables import TableServiceClient

AZURITE_TABLE_CONN = os.environ["AZURITE_TABLE_CONN"]
AZURITE_BLOB_CONN = os.environ["AZURITE_BLOB_CONN"]
GATEWAY_URL = os.environ.get("GATEWAY_URL", "http://gateway:8000")
TEST_KEY_HEX = "0" * 64

# Table names (must match gateway/app/tables.py)
GW_SUBSCRIPTIONS = "GwSubscriptions"
GW_ENCRYPTION_KEYS = "GwEncryptionKeys"
GW_API_KEYS = "GwApiKeys"
GW_JOBS = "GwJobs"
GW_USER_JOBS = "GwUserJobs"
USER_PERMISSIONS = "UserPermissions"


@pytest.fixture(scope="session", autouse=True)
def ensure_tables():
    """Create Azurite tables and blob container if they don't exist."""
    from azure.storage.blob import BlobServiceClient

    ts = TableServiceClient.from_connection_string(AZURITE_TABLE_CONN)
    for table in [GW_SUBSCRIPTIONS, GW_ENCRYPTION_KEYS, GW_API_KEYS, GW_JOBS, GW_USER_JOBS, USER_PERMISSIONS]:
        ts.create_table_if_not_exists(table)

    blob_svc = BlobServiceClient.from_connection_string(AZURITE_BLOB_CONN)
    try:
        blob_svc.create_container("jobs")
    except Exception:
        pass


@dataclass
class SeedCredentials:
    api_key: str
    sub_id: str
    user_id: str


@pytest.fixture
def credentials() -> SeedCredentials:
    """Seed a fresh API key + subscription + encryption key into Azurite."""
    suffix = uuid.uuid4().hex[:8]
    sub_id = f"sdk_test_sub_{suffix}"
    user_id = f"sdk_test_user_{suffix}"
    api_key = f"pk_{secrets.token_hex(16)}"
    key_hash = hashlib.sha256(api_key.encode()).hexdigest()

    ts = TableServiceClient.from_connection_string(AZURITE_TABLE_CONN)

    ts.get_table_client(GW_API_KEYS).upsert_entity({
        "PartitionKey": "key",
        "RowKey": key_hash,
        "sub_id": sub_id,
        "user_id": user_id,
    })

    ts.get_table_client(GW_SUBSCRIPTIONS).upsert_entity({
        "PartitionKey": "subscription",
        "RowKey": sub_id,
        "user_id": user_id,
        "key_name": f"key-{suffix}",
    })

    ts.get_table_client(GW_ENCRYPTION_KEYS).upsert_entity({
        "PartitionKey": "key",
        "RowKey": user_id,
        "key_hex": TEST_KEY_HEX,
    })

    inverted_ts = str(9_999_999_999_999 - int(time.time() * 1000)).zfill(13)
    ts.get_table_client(USER_PERMISSIONS).upsert_entity({
        "PartitionKey": user_id,
        "RowKey": f"{inverted_ts}_{suffix}",
        "timestamp": datetime.now(UTC).isoformat(),
        "isAdmin": False,
        "blocked": False,
        "stripeCustomerId": "",
        "changedBy": "system",
    })

    return SeedCredentials(api_key=api_key, sub_id=sub_id, user_id=user_id)
