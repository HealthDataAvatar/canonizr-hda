"""Disk cache for canonize results.

Keyed by xxhash of file content (same algorithm as the gateway).
Stores manifest JSON + artefact files in per-hash directories.
LRU eviction tracked via access timestamps in a manifest file.

Structure:
    ~/.cache/canonizr/
        {hash}/
            manifest.json     # JobStatus serialized
            {artefact_name}   # raw artefact bytes
        _index.json           # hash -> last_access_epoch, for LRU eviction
"""

from __future__ import annotations

import json
import re
import time
from pathlib import Path
from typing import Protocol

import xxhash

from .models import ArtefactMeta, JobStatus

DEFAULT_CACHE_DIR = Path.home() / ".cache" / "canonizr"
DEFAULT_MAX_ENTRIES = 500

# Whitelist for server-supplied path segments used as filenames/dirs.
# Covers both gateway artefact names (^[a-z0-9-]+$) and url-safe job IDs
# (token_urlsafe → A-Za-z0-9_-). Deny-by-default: no dots, slashes, or
# anything else that could traverse out of the cache directory.
_SAFE_SEGMENT = re.compile(r"^[A-Za-z0-9_-]+$")


def _safe_segment(name: str) -> str:
    """Validate a server-supplied path segment against a whitelist.

    Artefact names and job IDs come from the server (a trust boundary);
    a hostile or buggy server could send "../../.ssh/authorized_keys".
    Fail closed — only the known-good charset is allowed onto disk.
    """
    if not _SAFE_SEGMENT.match(name):
        raise ValueError(f"unsafe path segment: {name!r}")
    return name


def _is_regular_file(path: Path) -> bool:
    """True only for a real file — not a symlink, dir, or special file.

    A symlink planted in the cache dir could redirect a read to (or a write
    through) a sensitive file like ~/.ssh/id_rsa. Refuse to follow it.
    """
    return path.is_file() and not path.is_symlink()


def _no_symlink(path: Path) -> Path:
    """Refuse to write through an existing symlink (would corrupt its target)."""
    if path.is_symlink():
        raise ValueError(f"refusing to write through symlink: {path}")
    return path


class Clock(Protocol):
    """Abstraction over time for testing."""

    def now(self) -> float: ...


class _SystemClock:
    def now(self) -> float:
        return time.time()


class DiskCache:
    """File-system cache for canonize results.

    Thread safety: not guaranteed — intended for single-process use
    (CLI, MCP server). The worst case of a race is a redundant API call.
    """

    def __init__(
        self,
        cache_dir: Path = DEFAULT_CACHE_DIR,
        max_entries: int = DEFAULT_MAX_ENTRIES,
        clock: Clock | None = None,
    ):
        self._dir = cache_dir
        self._max_entries = max_entries
        self._clock = clock or _SystemClock()

    def file_hash(self, data: bytes) -> str:
        """Hash file content (same as gateway's document_hash)."""
        return xxhash.xxh3_64_hexdigest(data)

    def get_status(self, file_hash: str) -> JobStatus | None:
        """Look up a cached manifest by file hash. Returns None on miss."""
        manifest_path = self._dir / file_hash / "manifest.json"
        if not _is_regular_file(manifest_path):
            return None
        try:
            data = json.loads(manifest_path.read_text())
            self._touch(file_hash)
            return _deserialize_status(data)
        except (json.JSONDecodeError, KeyError, TypeError):
            return None

    def put_status(self, file_hash: str, status: JobStatus) -> None:
        """Cache a job manifest."""
        entry_dir = self._entry_dir(file_hash)
        manifest_path = _no_symlink(entry_dir / "manifest.json")
        manifest_path.write_text(json.dumps(_serialize_status(status), indent=2))
        self._touch(file_hash)
        self._evict_if_needed()

    def get_artefact(self, file_hash: str, name: str) -> bytes | None:
        """Look up a cached artefact. Returns None on miss."""
        path = self._dir / file_hash / _safe_segment(name)
        if not _is_regular_file(path):
            return None
        self._touch(file_hash)
        return path.read_bytes()

    def put_artefact(self, file_hash: str, name: str, data: bytes) -> None:
        """Cache an artefact's content."""
        entry_dir = self._entry_dir(file_hash)
        _no_symlink(entry_dir / _safe_segment(name)).write_bytes(data)
        self._touch(file_hash)

    def artefact_path(self, file_hash: str, name: str) -> Path | None:
        """Return the filesystem path to a cached artefact, or None if not cached."""
        path = self._dir / file_hash / _safe_segment(name)
        return path if _is_regular_file(path) else None

    def evict(self, file_hash: str) -> None:
        """Remove a cache entry entirely."""
        import shutil

        entry_dir = self._dir / file_hash
        if entry_dir.exists():
            shutil.rmtree(entry_dir)
        index = self._load_index()
        index.pop(file_hash, None)
        self._save_index(index)

    # -- internals --

    def _entry_dir(self, file_hash: str) -> Path:
        """Cache entry dir, created private (0o700). Cache holds the user's
        own documents — keep them out of reach of other accounts."""
        self._dir.mkdir(parents=True, exist_ok=True, mode=0o700)
        entry = self._dir / file_hash
        entry.mkdir(exist_ok=True, mode=0o700)
        return entry

    def _index_path(self) -> Path:
        return self._dir / "_index.json"

    def _load_index(self) -> dict[str, float]:
        path = self._index_path()
        if not path.exists():
            return {}
        try:
            return json.loads(path.read_text())
        except (json.JSONDecodeError, TypeError):
            return {}

    def _save_index(self, index: dict[str, float]) -> None:
        self._dir.mkdir(parents=True, exist_ok=True, mode=0o700)
        _no_symlink(self._index_path()).write_text(json.dumps(index))

    def _touch(self, file_hash: str) -> None:
        index = self._load_index()
        index[file_hash] = self._clock.now()
        self._save_index(index)

    def _evict_if_needed(self) -> None:
        index = self._load_index()
        if len(index) <= self._max_entries:
            return
        # Evict oldest entries
        sorted_hashes = sorted(index, key=lambda h: index[h])
        to_evict = sorted_hashes[: len(index) - self._max_entries]
        for h in to_evict:
            self.evict(h)


def _serialize_status(status: JobStatus) -> dict:
    return {
        "job_id": status.job_id,
        "status": status.status,
        "metadata": status.metadata,
        "artefacts": [
            {"name": a.name, "mime_type": a.mime_type, "size_bytes": a.size_bytes, "label": a.label}
            for a in status.artefacts
        ],
        "expires_at": status.expires_at,
        "detail": status.detail,
    }


def _deserialize_status(data: dict) -> JobStatus:
    artefacts = tuple(ArtefactMeta(**a) for a in data.get("artefacts", []))
    return JobStatus(
        job_id=data["job_id"],
        status=data["status"],
        metadata=data.get("metadata"),
        artefacts=artefacts,
        expires_at=data.get("expires_at"),
        detail=data.get("detail"),
    )
