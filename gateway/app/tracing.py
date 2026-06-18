"""Lightweight structured tracing for pipeline observability."""

from __future__ import annotations

import time
from collections.abc import Generator
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any


class Service(StrEnum):
    """Pipeline services that produce traced steps."""

    LITEPARSE = "liteparse"
    PIKEPDF = "pikepdf"
    GOTENBERG = "gotenberg"
    MARKITDOWN = "markitdown"
    PASSTHROUGH = "passthrough"
    LIBREOFFICE = "libreoffice"
    THUMBNAILS = "thumbnails"
    ARTEFACTS = "artefacts"
    NORMALISE_IMAGE = "normalise_image"


_SERVICE_NAMES = frozenset(Service)


@dataclass
class RetryRecord:
    """A single retry attempt on an upstream service."""

    attempt: int
    status_code: int
    delay_s: float
    retry_after_header: str | None = None


@dataclass
class Step:
    """Typed output from a service span — used for telemetry."""

    service: str
    started_at: str
    duration_ms: float
    attributes: dict[str, Any] = field(default_factory=dict)
    total_retries: int = 0
    total_retry_delay_ms: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "service": self.service,
            "started_at": self.started_at,
            "duration_ms": self.duration_ms,
        }
        d.update(self.attributes)
        if self.total_retries:
            d["total_retries"] = self.total_retries
            d["total_retry_delay_ms"] = self.total_retry_delay_ms
        return d


@dataclass
class Span:
    name: str
    attributes: dict[str, Any] = field(default_factory=dict)
    children: list[Span] = field(default_factory=list)
    retries: list[RetryRecord] = field(default_factory=list)
    _start: float = field(default=0.0, repr=False)
    _end: float | None = field(default=None, repr=False)
    _wall_start: datetime | None = field(default=None, repr=False)

    @property
    def duration_ms(self) -> float | None:
        if self._end is None:
            return None
        return (self._end - self._start) * 1000

    @contextmanager
    def span(self, name: str, **attrs: Any) -> Generator[Span, None, None]:
        child = Span(
            name=name,
            attributes=attrs,
            _start=time.monotonic(),
            _wall_start=datetime.now(UTC),
        )
        self.children.append(child)
        try:
            yield child
        finally:
            child._end = time.monotonic()

    def set(self, **attrs: Any) -> None:
        self.attributes.update(attrs)

    def add_retry(self, record: RetryRecord) -> None:
        self.retries.append(record)

    def to_dict(self, root_start: float | None = None) -> dict[str, Any]:
        if root_start is None:
            root_start = self._start
        result: dict[str, Any] = {"name": self.name}
        result["offset_ms"] = round((self._start - root_start) * 1000)
        duration = self.duration_ms
        if duration is not None:
            result["duration_ms"] = round(duration, 1)
        if self.attributes:
            result["attributes"] = self.attributes
        if self.children:
            result["children"] = [c.to_dict(root_start) for c in self.children]
        return result


class Trace:
    """Root trace container. Create one per request."""

    def __init__(self, name: str = "request", **attrs: Any):
        self.root = Span(
            name=name,
            attributes=attrs,
            _start=time.monotonic(),
            _wall_start=datetime.now(UTC),
        )

    def span(self, name: str, **attrs: Any):
        return self.root.span(name, **attrs)

    def finish(self) -> None:
        self.root._end = time.monotonic()

    def to_dict(self) -> dict[str, Any]:
        return self.root.to_dict(self.root._start)

    def to_steps(self) -> list[Step]:
        """Flatten the span tree into a sorted list of typed Steps."""
        steps = _collect_steps(self.root)
        steps.sort(key=lambda s: s.started_at)
        return steps


def _collect_steps(span: Span) -> list[Step]:
    """Recursively collect service-level spans as typed Steps."""
    if span.name in _SERVICE_NAMES:
        return [_span_to_step(span)]
    steps: list[Step] = []
    for child in span.children:
        steps.extend(_collect_steps(child))
    return steps


def _span_to_step(span: Span) -> Step:
    """Convert a service span to a typed Step."""
    attrs = {k: v for k, v in span.attributes.items() if k != "service"}
    total_retries = len(span.retries)
    total_retry_delay_ms = round(sum(r.delay_s * 1000 for r in span.retries), 1)
    return Step(
        service=span.attributes.get("service", span.name),
        started_at=span._wall_start.isoformat() if span._wall_start else "",
        duration_ms=round(span.duration_ms, 1) if span.duration_ms is not None else 0,
        attributes=attrs,
        total_retries=total_retries,
        total_retry_delay_ms=total_retry_delay_ms,
    )
