"""Canonizr Python SDK — convert documents to structured markdown."""

from .client import AsyncCanonizr, Canonizr
from .errors import (
    AccountBlockedError,
    AuthError,
    CanonizrError,
    FileTooLargeError,
    JobExpiredError,
    JobFailedError,
    PaymentOverdueError,
    PaymentRequiredError,
    QuotaExceededError,
    RateLimitError,
    TimeoutError,
    UnsupportedFileError,
)
from .models import ArtefactMeta, AsyncCanonizeResult, CanonizeResult, JobStatus, SubmitResult

__all__ = [
    "AccountBlockedError",
    "ArtefactMeta",
    "AsyncCanonizeResult",
    "AsyncCanonizr",
    "AuthError",
    "CanonizeResult",
    "Canonizr",
    "CanonizrError",
    "FileTooLargeError",
    "JobExpiredError",
    "JobFailedError",
    "JobStatus",
    "PaymentOverdueError",
    "PaymentRequiredError",
    "QuotaExceededError",
    "RateLimitError",
    "SubmitResult",
    "TimeoutError",
    "UnsupportedFileError",
]
