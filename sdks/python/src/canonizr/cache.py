"""Disk cache for canonize results.

Keyed by xxhash of file content (same algorithm as the gateway).
Stores manifest JSON + artefact files in per-hash directories. No eviction:
the cache grows until the user clears it (delete the dir). Converted results
are small and disposable; bounding them isn't worth the bookkeeping.

Structure:
    ~/.cache/canonizr/
        {hash}/
            manifest.json     # JobStatus serialized
            {artefact_name}   # raw artefact bytes
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import xxhash

from .models import ArtefactMeta, JobStatus

DEFAULT_CACHE_DIR = Path.home() / ".cache" / "canonizr"

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


class DiskCache:
    """File-system cache for canonize results.

    Thread safety: not guaranteed — intended for single-process use
    (CLI, MCP server). Writes are atomic per-file; concurrent writers
    to the same hash just overwrite identical content.
    """

    def __init__(self, cache_dir: Path = DEFAULT_CACHE_DIR):
        self._dir = cache_dir

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
            return _deserialize_status(data)
        except (json.JSONDecodeError, KeyError, TypeError):
            return None

    def put_status(self, file_hash: str, status: JobStatus) -> None:
        """Cache a job manifest."""
        entry_dir = self._entry_dir(file_hash)
        manifest_path = _no_symlink(entry_dir / "manifest.json")
        manifest_path.write_text(json.dumps(_serialize_status(status), indent=2))

    def get_artefact(self, file_hash: str, name: str) -> bytes | None:
        """Look up a cached artefact. Returns None on miss."""
        path = self._dir / file_hash / _safe_segment(name)
        if not _is_regular_file(path):
            return None
        return path.read_bytes()

    def put_artefact(self, file_hash: str, name: str, data: bytes) -> None:
        """Cache an artefact's content."""
        entry_dir = self._entry_dir(file_hash)
        _no_symlink(entry_dir / _safe_segment(name)).write_bytes(data)

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

    # -- internals --

    def _entry_dir(self, file_hash: str) -> Path:
        """Cache entry dir, created private (0o700). Cache holds the user's
        own documents — keep them out of reach of other accounts."""
        self._dir.mkdir(parents=True, exist_ok=True, mode=0o700)
        entry = self._dir / file_hash
        entry.mkdir(exist_ok=True, mode=0o700)
        return entry


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
