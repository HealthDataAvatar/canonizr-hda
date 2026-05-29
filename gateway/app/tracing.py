"""Lightweight structured tracing for pipeline observability."""

from __future__ import annotations

import time
from collections.abc import Generator
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

_SERVICE_SPANS = frozenset(
    {
        "docling",
        "gotenberg",
        "captioning",
        "markitdown",
        "passthrough",
        "extract_pages",
        "libreoffice",
    }
)


@dataclass
class Span:
    name: str
    attributes: dict[str, Any] = field(default_factory=dict)
    children: list[Span] = field(default_factory=list)
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

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {"name": self.name}
        duration = self.duration_ms
        if duration is not None:
            result["duration_ms"] = round(duration, 1)
        if self.attributes:
            result["attributes"] = self.attributes
        if self.children:
            result["children"] = [c.to_dict() for c in self.children]
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
        return self.root.to_dict()

    def to_steps(self) -> list[dict[str, Any]]:
        """Flatten the span tree into a list of service-level step dicts."""
        steps: list[dict[str, Any]] = []
        _collect_steps(self.root, steps)
        steps.sort(key=lambda s: s["started_at"])
        return steps


def _collect_steps(span: Span, out: list[dict[str, Any]]) -> None:
    if span.name in _SERVICE_SPANS:
        step: dict[str, Any] = {
            "started_at": span._wall_start.isoformat() if span._wall_start else "",
            "service": span.attributes.get("service", span.name),
            "duration_ms": round(span.duration_ms, 1) if span.duration_ms is not None else 0,
        }
        for k, v in span.attributes.items():
            if k != "service":
                step[k] = v
        out.append(step)
        return
    for child in span.children:
        _collect_steps(child, out)
