"""Fake transport for testing — no HTTP, no mocking libraries needed."""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass, field

from canonizr._transport import Response


@dataclass
class RecordedRequest:
    method: str
    path: str
    files: dict[str, tuple[str, bytes, str]] | None = None


Handler = Callable[[str, str], Response]  # (method, path) -> Response


def json_response(status_code: int, body: dict) -> Response:
    return Response(status_code=status_code, body=json.dumps(body).encode(), headers={})


def json_response_with_headers(status_code: int, body: dict, headers: dict[str, str]) -> Response:
    return Response(status_code=status_code, body=json.dumps(body).encode(), headers=headers)


class FakeTransport:
    """In-memory sync transport that records requests and returns scripted responses."""

    def __init__(self) -> None:
        self.requests: list[RecordedRequest] = []
        self._responses: list[Response | Handler] = []
        self.closed: bool = False

    def enqueue(self, *responses: Response | Handler) -> None:
        """Queue responses to be returned in order."""
        self._responses.extend(responses)

    def _next(self, method: str, path: str) -> Response:
        if not self._responses:
            raise AssertionError(f"FakeTransport: no response queued for {method} {path}")
        r = self._responses.pop(0)
        if callable(r):
            return r(method, path)
        return r

    def post(self, path: str, *, files: dict[str, tuple[str, bytes, str]]) -> Response:
        self.requests.append(RecordedRequest("POST", path, files=files))
        return self._next("POST", path)

    def get(self, path: str) -> Response:
        self.requests.append(RecordedRequest("GET", path))
        return self._next("GET", path)

    def delete(self, path: str) -> Response:
        self.requests.append(RecordedRequest("DELETE", path))
        return self._next("DELETE", path)

    def close(self) -> None:
        self.closed = True


class FakeAsyncTransport:
    """In-memory async transport that records requests and returns scripted responses."""

    def __init__(self) -> None:
        self.requests: list[RecordedRequest] = []
        self._responses: list[Response | Handler] = []
        self.closed: bool = False

    def enqueue(self, *responses: Response | Handler) -> None:
        self._responses.extend(responses)

    def _next(self, method: str, path: str) -> Response:
        if not self._responses:
            raise AssertionError(f"FakeAsyncTransport: no response queued for {method} {path}")
        r = self._responses.pop(0)
        if callable(r):
            return r(method, path)
        return r

    async def post(self, path: str, *, files: dict[str, tuple[str, bytes, str]]) -> Response:
        self.requests.append(RecordedRequest("POST", path, files=files))
        return self._next("POST", path)

    async def get(self, path: str) -> Response:
        self.requests.append(RecordedRequest("GET", path))
        return self._next("GET", path)

    async def delete(self, path: str) -> Response:
        self.requests.append(RecordedRequest("DELETE", path))
        return self._next("DELETE", path)

    async def close(self) -> None:
        self.closed = True


@dataclass
class FakeClock:
    """Controllable clock for cache tests."""

    _time: float = 1000.0

    def now(self) -> float:
        return self._time

    def advance(self, seconds: float) -> None:
        self._time += seconds
