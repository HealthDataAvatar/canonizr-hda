"""Artefact store — streams intermediate pipeline products to blob storage.

Each artefact is encrypted and uploaded immediately (no memory accumulation).
The store owns name allocation to prevent clashes and is the source of truth
for the manifest.
"""

import json
import re
from dataclasses import asdict, dataclass

from .crypto import encrypt
from .protocols import BlobStore

# Artefact names must be safe for URL paths: lowercase alphanumeric + hyphens
_VALID_NAME = re.compile(r"^[a-z0-9]([a-z0-9-]*[a-z0-9])?$")


@dataclass
class ArtefactMeta:
    name: str  # e.g. "pdf", "page-1", "image-1"
    mime_type: str
    size_bytes: int
    label: str = ""  # human-readable: "Converted PDF", "Page 1", "Bar Chart"


class ArtefactStore:
    """Encrypts and uploads artefacts as they're produced, building a manifest.

    The store owns name allocation — call allocate() to get a unique name
    for a given prefix, preserving document order.
    """

    def __init__(self, blob_prefix: str, encryption_key: bytes, blobs: BlobStore):
        self._prefix = blob_prefix
        self._key = encryption_key
        self._blobs = blobs
        self._manifest: list[ArtefactMeta] = []
        self._counters: dict[str, int] = {}

    def allocate(self, prefix: str) -> str:
        """Allocate a unique name for the given prefix.

        First call with "page" returns "page-1", second returns "page-2", etc.
        For singleton artefacts (e.g. "pdf", "markdown"), just use put() directly.
        """
        count = self._counters.get(prefix, 0) + 1
        self._counters[prefix] = count
        return f"{prefix}-{count}"

    async def put(self, name: str, data: bytes, mime_type: str, label: str = "") -> None:
        """Encrypt and upload an artefact. Name must be URL-safe."""
        if not _VALID_NAME.match(name):
            raise ValueError(f"Invalid artefact name: {name!r}")
        encrypted = encrypt(data, self._key)
        await self._blobs.put(f"{self._prefix}/artefacts/{name}.bin", encrypted)
        self._manifest.append(ArtefactMeta(name=name, mime_type=mime_type, size_bytes=len(data), label=label))

    @property
    def manifest(self) -> list[ArtefactMeta]:
        return list(self._manifest)

    def manifest_json(self) -> str:
        return json.dumps([asdict(a) for a in self._manifest], separators=(",", ":"))


# Keep old name as alias during migration
ArtefactWriter = ArtefactStore
