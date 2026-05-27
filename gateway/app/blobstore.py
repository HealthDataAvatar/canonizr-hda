"""Blob storage abstraction for job inputs and outputs.

Supports two backends via BLOB_STORE_URL env var:
- file:///path/to/dir  — shared filesystem (docker-compose, local dev)
- (future) Azure Blob Storage URL

Redis stays lean: only queue metadata, signals, and counters.
Blobs hold the heavy encrypted payloads.
"""

import logging
import os
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

BLOB_STORE_URL = os.environ.get("BLOB_STORE_URL", "")


async def put(key: str, data: bytes) -> None:
    """Store a blob by key."""
    if BLOB_STORE_URL.startswith("file://"):
        _fs_put(key, data)
    else:
        raise RuntimeError(f"Unsupported blob store: {BLOB_STORE_URL}")


async def get(key: str) -> Optional[bytes]:
    """Retrieve a blob by key. Returns None if not found."""
    if BLOB_STORE_URL.startswith("file://"):
        return _fs_get(key)
    else:
        raise RuntimeError(f"Unsupported blob store: {BLOB_STORE_URL}")


async def delete(key: str) -> None:
    """Delete a blob by key. No error if missing."""
    if BLOB_STORE_URL.startswith("file://"):
        _fs_delete(key)
    else:
        raise RuntimeError(f"Unsupported blob store: {BLOB_STORE_URL}")


def _fs_root() -> Path:
    return Path(BLOB_STORE_URL.removeprefix("file://"))


def _fs_put(key: str, data: bytes) -> None:
    path = _fs_root() / key
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def _fs_get(key: str) -> Optional[bytes]:
    path = _fs_root() / key
    if not path.exists():
        return None
    return path.read_bytes()


def _fs_delete(key: str) -> None:
    path = _fs_root() / key
    path.unlink(missing_ok=True)
    # Clean up empty parent dirs
    try:
        path.parent.rmdir()
    except OSError:
        pass
