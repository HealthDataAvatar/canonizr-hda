"""Typed telemetry API — pluggable backend for job observability.

Events are dataclasses with event_name and distinct_id.
Emitters are generic — one emit() method handles all event types.
Adding a new event = one new dataclass, zero emitter changes.
"""

from __future__ import annotations

import contextvars
import json
import logging
import os
from dataclasses import asdict, dataclass, field
from typing import Any, Protocol, runtime_checkable

from posthog import Posthog

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Event protocol — all events must satisfy this
# ---------------------------------------------------------------------------


@runtime_checkable
class TelemetryEvent(Protocol):
    event_name: str
    distinct_id: str


# ---------------------------------------------------------------------------
# Events
# ---------------------------------------------------------------------------


@dataclass
class ServiceStep:
    """A single service invocation within a job (nested in JobCompleted)."""

    name: str
    duration_ms: float
    retries: int = 0
    retry_delay_ms: float = 0.0


@dataclass
class JobCompleted:
    """Emitted when a job finishes (success or failure)."""

    event_name: str = field(default="job_completed", init=False)

    job_id: str = ""
    user_id: str = ""
    sub_id: str = ""
    distinct_id: str = ""  # set to user_id
    status: str = ""  # "ok" or "error"
    error: str = ""
    mime_type: str = ""
    filename: str = ""
    input_bytes: int = 0
    queue_wait_ms: float = 0.0
    processing_ms: float = 0.0
    total_ms: float = 0.0
    services: list[ServiceStep] = field(default_factory=list)
    images_captioned: int = 0
    images_errored: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0

    def __post_init__(self) -> None:
        if not self.distinct_id:
            self.distinct_id = self.user_id


@dataclass
class UpstreamRequest:
    """Emitted for every HTTP call to a downstream service."""

    event_name: str = field(default="upstream_request", init=False)

    service: str = ""
    method: str = ""
    status_code: int = 0
    duration_ms: float = 0.0
    response_bytes: int = 0
    is_retry: bool = False
    attempt: int = 0
    retry_after_header: str | None = None
    error: str | None = None
    job_id: str = ""
    user_id: str = ""
    distinct_id: str = ""

    def __post_init__(self) -> None:
        if not self.distinct_id:
            self.distinct_id = self.user_id or "system"


@dataclass
class CleanupCompleted:
    """Emitted when the cleanup cron job finishes."""

    event_name: str = field(default="cleanup_completed", init=False)
    distinct_id: str = "system"

    status: str = ""  # "ok", "partial", "error"
    error: str = ""
    scanned: int = 0
    blobs_deleted: int = 0
    marked_deleted: int = 0
    already_clean: int = 0
    errors: int = 0


# ---------------------------------------------------------------------------
# Emitter protocol + implementations
# ---------------------------------------------------------------------------


class TelemetryEmitter(Protocol):
    def emit(self, event: Any) -> None: ...
    def shutdown(self) -> None: ...


class LoggingEmitter:
    """Emits telemetry as structured JSON log lines."""

    def emit(self, event: Any) -> None:
        logger.info("%s %s", event.event_name, json.dumps(asdict(event)))

    def shutdown(self) -> None:
        pass


class PostHogEmitter:
    """Emits telemetry to PostHog + structured log."""

    def __init__(self, api_key: str | None = None):
        key = api_key or os.environ.get("POSTHOG_API_KEY", "")
        if key:
            self._client: Posthog | None = Posthog(key, host="https://us.i.posthog.com")
        else:
            self._client = None
            logger.warning("POSTHOG_API_KEY not set — telemetry will only be logged")

    def emit(self, event: Any) -> None:
        d = asdict(event)
        logger.info("%s %s", event.event_name, json.dumps(d))
        if self._client:
            self._client.capture(
                distinct_id=event.distinct_id,
                event=event.event_name,
                properties=d,
            )

    def shutdown(self) -> None:
        if self._client:
            self._client.shutdown()


# ---------------------------------------------------------------------------
# Context variables — set in process_job, read in retry.py
# ---------------------------------------------------------------------------

_current_emitter: contextvars.ContextVar[TelemetryEmitter | None] = contextvars.ContextVar(
    "_current_emitter", default=None
)
_current_job_id: contextvars.ContextVar[str] = contextvars.ContextVar("_current_job_id", default="")
_current_user_id: contextvars.ContextVar[str] = contextvars.ContextVar("_current_user_id", default="")


def set_telemetry_context(emitter: TelemetryEmitter, job_id: str, user_id: str) -> None:
    _current_emitter.set(emitter)
    _current_job_id.set(job_id)
    _current_user_id.set(user_id)


def get_telemetry_context() -> tuple[TelemetryEmitter | None, str, str]:
    return _current_emitter.get(), _current_job_id.get(), _current_user_id.get()
