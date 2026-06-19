"""Canonizr Python SDK — convert documents to structured markdown."""

from .client import AsyncCanonizr, Canonizr
from .errors import (
    AuthError,
    CanonizrError,
    FileTooLargeError,
    JobExpiredError,
    JobFailedError,
    PaymentRequiredError,
    QuotaExceededError,
    RateLimitError,
    TimeoutError,
    UnsupportedFileError,
)
from .models import ArtefactMeta, AsyncCanonizeResult, CanonizeResult, JobStatus, SubmitResult

__all__ = [
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
    "PaymentRequiredError",
    "QuotaExceededError",
    "RateLimitError",
    "SubmitResult",
    "TimeoutError",
    "UnsupportedFileError",
]
