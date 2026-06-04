"""Input sanitization for user-supplied values stored in metadata."""

import re
import unicodedata
from urllib.parse import quote


def sanitize_filename(raw: str) -> str:
    """Strip path components, dangerous chars, and truncate.

    The result is safe for storage as a metadata string and for use in
    Content-Disposition headers. Never used in file paths or shell commands.

    Whitelist: Unicode letters, digits, underscores, hyphens, dots.
    Everything else (spaces, quotes, semicolons, etc.) becomes ``_``.
    """
    # Take only the final path component (strip directory traversal)
    name = raw.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    # Remove control characters and null bytes
    name = "".join(c for c in name if c.isprintable() and c != "\x00")
    # NFC-normalise (e.g. i + combining accent → í)
    name = unicodedata.normalize("NFC", name)
    # Whitelist: letters, digits, underscores, hyphens, dots
    name = re.sub(r"[^\w.\-]", "_", name)
    # Strip leading/trailing underscores and dots
    name = name.strip("_.").strip()
    # Truncate to 255 characters
    return name[:255] or "document"


def content_disposition(filename: str | None) -> str:
    """Build a safe Content-Disposition header value.

    Uses RFC 5987 ``filename*`` for non-latin-1 filenames, with an ASCII
    fallback in the plain ``filename`` parameter.
    """
    name = filename or "document"
    name = unicodedata.normalize("NFC", name)
    try:
        name.encode("latin-1")
        return f'attachment; filename="{name}"'
    except UnicodeEncodeError:
        ascii_fallback = name.encode("ascii", errors="replace").decode("ascii")
        utf8_quoted = quote(name)
        return f"attachment; filename=\"{ascii_fallback}\"; filename*=UTF-8''{utf8_quoted}"
