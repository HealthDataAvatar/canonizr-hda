"""Processing time estimates based on MIME type and file size.

Used by the gateway to set estimated_seconds in the 202 response
and Retry-After headers on /result polling.
"""

from .mimetypes import LIBREOFFICE_TYPES, MARKITDOWN_TYPES, PASSTHROUGH_TYPES

UNIT_BYTES = 100_000  # 100KB billing unit

# USD per 100KB unit, recorded as the per-job historical snapshot. This mirrors
# the Stripe Price `canonizr_per_100kb`, which is what actually invoices — Stripe
# owns billing. There is no per-user rate: that would need a distinct Stripe Price
# per user (see docs/issues/stripe.md "tier registry"). Keep this in sync with the
# portal's RATE_PER_UNIT (portal/lib/pure/billing-calc.ts).
RATE_PER_UNIT = 0.003


def billable_units(n_bytes: int) -> int:
    """Number of 100KB units for a file — rounded up, minimum 1. The single money formula."""
    return max(1, -(-n_bytes // UNIT_BYTES))


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
