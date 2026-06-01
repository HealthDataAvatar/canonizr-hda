"""Typed telemetry API — pluggable backend for job observability."""

from __future__ import annotations

import contextvars
import json
import logging
import os
from dataclasses import asdict, dataclass, field
from typing import Protocol

from posthog import Posthog

logger = logging.getLogger(__name__)


@dataclass
class ServiceTelemetry:
    """Telemetry for a single pipeline service invocation."""

    name: str
    duration_ms: float
    retries: int = 0
    retry_delay_ms: float = 0.0
    status: str = "ok"


@dataclass
class UpstreamRequest:
    """Telemetry for a single HTTP call to a downstream service."""

    service: str
    method: str
    status_code: int
    duration_ms: float
    response_bytes: int = 0
    is_retry: bool = False
    attempt: int = 0
    retry_after_header: str | None = None
    error: str | None = None
    job_id: str = ""
    user_id: str = ""


@dataclass
class JobTelemetry:
    """Telemetry emitted on job completion (success or failure)."""

    job_id: str
    user_id: str
    sub_id: str
    status: str  # "ok" or "error"
    error: str = ""
    mime_type: str = ""
    filename: str = ""
    input_bytes: int = 0
    queue_wait_ms: float = 0.0
    processing_ms: float = 0.0
    total_ms: float = 0.0
    services: list[ServiceTelemetry] = field(default_factory=list)
    images_captioned: int = 0
    images_errored: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0


class TelemetryEmitter(Protocol):
    def emit_job_completed(self, event: JobTelemetry) -> None: ...
    def emit_upstream_request(self, event: UpstreamRequest) -> None: ...


# Context variables — set in process_job, read in retry.py and service modules
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


class LoggingEmitter:
    """Emits telemetry as structured JSON log lines."""

    def emit_job_completed(self, event: JobTelemetry) -> None:
        logger.info("job_completed %s", json.dumps(asdict(event)))

    def emit_upstream_request(self, event: UpstreamRequest) -> None:
        logger.info("upstream_request %s", json.dumps(asdict(event)))


class PostHogEmitter:
    """Emits telemetry to PostHog + structured log."""

    def __init__(self, api_key: str | None = None):
        key = api_key or os.environ.get("POSTHOG_API_KEY", "")
        if key:
            self._client: Posthog | None = Posthog(key, host="https://us.i.posthog.com")
        else:
            self._client = None
            logger.warning("POSTHOG_API_KEY not set — telemetry will only be logged")

    def _capture(self, distinct_id: str, event: str, properties: dict) -> None:
        if self._client:
            self._client.capture(distinct_id=distinct_id, event=event, properties=properties)

    def emit_job_completed(self, event: JobTelemetry) -> None:
        d = asdict(event)
        logger.info("job_completed %s", json.dumps(d))
        self._capture(event.user_id, "job_completed", d)

    def emit_upstream_request(self, event: UpstreamRequest) -> None:
        d = asdict(event)
        logger.info("upstream_request %s", json.dumps(d))
        self._capture(event.user_id or "system", "upstream_request", d)

    def shutdown(self) -> None:
        if self._client:
            self._client.shutdown()
