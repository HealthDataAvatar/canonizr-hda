"""Typed telemetry API — pluggable backend for job observability."""

from __future__ import annotations

import json
import logging
from dataclasses import asdict, dataclass, field
from typing import Protocol

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


class LoggingEmitter:
    """Emits telemetry as structured JSON log lines."""

    def emit_job_completed(self, event: JobTelemetry) -> None:
        logger.info("job_completed %s", json.dumps(asdict(event)))
