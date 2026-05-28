"""Input sanitization for user-supplied values stored in metadata."""

from .convert import LIBREOFFICE_TYPES, MARKITDOWN_TYPES, PASSTHROUGH_TYPES

KNOWN_MIME_TYPES = PASSTHROUGH_TYPES | MARKITDOWN_TYPES | LIBREOFFICE_TYPES | {"application/pdf"}

# Image types are checked by prefix, not exact match
IMAGE_PREFIX = "image/"


def sanitize_filename(raw: str) -> str:
    """Strip path components, control chars, null bytes, and truncate.

    The result is safe for storage as a metadata string and for use in
    Content-Disposition headers. Never used in file paths or shell commands.
    """
    # Take only the final path component (strip directory traversal)
    name = raw.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    # Remove control characters and null bytes
    name = "".join(c for c in name if c.isprintable() and c != "\x00")
    # Strip leading/trailing whitespace and dots (Windows hidden files, path tricks)
    name = name.strip().strip(".")
    # Truncate to 255 characters
    return name[:255] or "document"


def is_known_mime_type(mime_type: str) -> bool:
    """Check if a MIME type is in our known set."""
    if mime_type in KNOWN_MIME_TYPES:
        return True
    if mime_type.startswith(IMAGE_PREFIX):
        return True
    return False
