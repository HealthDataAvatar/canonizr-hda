"""Error hierarchy for the Canonizr SDK."""

from __future__ import annotations


class CanonizrError(Exception):
    """Base error for all Canonizr SDK errors."""

    def __init__(self, message: str, status_code: int | None = None):
        self.status_code = status_code
        super().__init__(message)


class AuthError(CanonizrError):
    """401 — missing or invalid API key."""

    def __init__(self, message: str = "Invalid or missing API key"):
        super().__init__(message, status_code=401)


class RateLimitError(CanonizrError):
    """429 `rate_limited` — too many requests too quickly. Retryable after a delay."""

    def __init__(self, message: str, retry_after: float | None = None):
        self.retry_after = retry_after
        super().__init__(message, status_code=429)


class QuotaExceededError(CanonizrError):
    """429 `quota_exceeded` — account or per-key quota for this period is spent.

    Terminal: retrying won't help until the billing period resets or the cap is raised.
    """

    def __init__(self, message: str = "Quota exceeded for this billing period"):
        super().__init__(message, status_code=429)


class PaymentRequiredError(CanonizrError):
    """402 `payment_required` — free allowance reached and paid usage not enabled.

    Terminal: enable paid usage in the portal to continue.
    """

    def __init__(self, message: str = "Enable paid usage to continue past the free allowance"):
        super().__init__(message, status_code=402)


class FileTooLargeError(CanonizrError):
    """413 — file exceeds size limit."""

    def __init__(self, message: str = "File too large (max 50MB)"):
        super().__init__(message, status_code=413)


class UnsupportedFileError(CanonizrError):
    """400 — unsupported file type."""

    def __init__(self, message: str = "Unsupported file type"):
        super().__init__(message, status_code=400)


class JobFailedError(CanonizrError):
    """500 — job processing failed on the server."""

    def __init__(self, message: str = "Job processing failed"):
        super().__init__(message, status_code=500)


class JobExpiredError(CanonizrError):
    """410 — job result expired or deleted."""

    def __init__(self, message: str = "Job expired or deleted"):
        super().__init__(message, status_code=410)


class TimeoutError(CanonizrError):
    """Polling exceeded the configured timeout."""

    def __init__(self, job_id: str, timeout: float):
        self.job_id = job_id
        self.timeout = timeout
        super().__init__(f"Job {job_id} did not complete within {timeout}s")


_STATUS_ERRORS: dict[int, type[CanonizrError]] = {
    400: UnsupportedFileError,
    401: AuthError,
    410: JobExpiredError,
    413: FileTooLargeError,
}


def raise_for_status(
    status_code: int, detail: str, retry_after: float | None = None, code: str | None = None
) -> None:
    """Raise the appropriate CanonizrError. The typed `code` wins over status alone.

    A 429 can be transient (`rate_limited`) or terminal (`quota_exceeded`) — the
    client must branch on `code`, not status, to know whether to back off.
    """
    if code == "payment_required":
        raise PaymentRequiredError(detail)
    if code == "quota_exceeded":
        raise QuotaExceededError(detail)
    if status_code == 429:
        raise RateLimitError(detail, retry_after=retry_after)
    cls = _STATUS_ERRORS.get(status_code)
    if cls:
        raise cls(detail)
    if status_code >= 500:
        raise JobFailedError(detail)
    if status_code >= 400:
        raise CanonizrError(detail, status_code=status_code)
