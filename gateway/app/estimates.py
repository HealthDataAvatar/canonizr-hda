"""Processing time estimates based on MIME type and file size.

Used by the gateway to set estimated_seconds in the 202 response
and Retry-After headers on /result polling.
"""

from .convert import LIBREOFFICE_TYPES, MARKITDOWN_TYPES, PASSTHROUGH_TYPES


def estimate_seconds(mime_type: str, file_size_bytes: int) -> int:
    """Estimate processing time in seconds. Conservative (rounds up)."""
    if mime_type in PASSTHROUGH_TYPES:
        return 2

    if mime_type in MARKITDOWN_TYPES:
        return 5

    if mime_type == "application/pdf":
        mb = file_size_bytes / (1024 * 1024)
        return max(3, int(2 + 6 * mb))

    if mime_type.startswith("image/"):
        return 8

    if mime_type in LIBREOFFICE_TYPES:
        return 60

    return 10  # unknown type, conservative default
