"""Document hashing for deduplication and audit trail."""

import xxhash


def document_hash(data: bytes) -> str:
    """Fast, non-cryptographic hash of file contents. Used for dedup and billing headers."""
    return xxhash.xxh3_64_hexdigest(data)
