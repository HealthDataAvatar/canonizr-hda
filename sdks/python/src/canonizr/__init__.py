"""Canonizr Python SDK — convert documents to structured markdown."""

from .client import AsyncCanonizr, Canonizr
from .errors import (
    AuthError,
    CanonizrError,
    FileTooLargeError,
    JobExpiredError,
    JobFailedError,
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
    "RateLimitError",
    "SubmitResult",
    "TimeoutError",
    "UnsupportedFileError",
]
