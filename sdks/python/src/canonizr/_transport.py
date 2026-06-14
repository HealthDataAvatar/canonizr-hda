"""Transport protocol — abstracts HTTP so client logic is testable without httpx."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class Response:
    """Minimal HTTP response — just what the client needs."""

    status_code: int
    body: bytes
    headers: dict[str, str]

    def json(self) -> dict:
        import json

        return json.loads(self.body)


class Transport(Protocol):
    """Sync HTTP transport."""

    def post(self, path: str, *, files: dict[str, tuple[str, bytes, str]]) -> Response: ...
    def get(self, path: str) -> Response: ...
    def delete(self, path: str) -> Response: ...
    def close(self) -> None: ...


class AsyncTransport(Protocol):
    """Async HTTP transport."""

    async def post(self, path: str, *, files: dict[str, tuple[str, bytes, str]]) -> Response: ...
    async def get(self, path: str) -> Response: ...
    async def delete(self, path: str) -> Response: ...
    async def close(self) -> None: ...


class HttpxTransport:
    """Production sync transport backed by httpx."""

    def __init__(self, base_url: str, api_key: str, timeout: float = 30.0):
        import httpx

        self._client = httpx.Client(
            base_url=base_url,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=timeout,
        )

    def post(self, path: str, *, files: dict[str, tuple[str, bytes, str]]) -> Response:
        r = self._client.post(path, files=files)
        return Response(status_code=r.status_code, body=r.content, headers=dict(r.headers))

    def get(self, path: str) -> Response:
        r = self._client.get(path)
        return Response(status_code=r.status_code, body=r.content, headers=dict(r.headers))

    def delete(self, path: str) -> Response:
        r = self._client.delete(path)
        return Response(status_code=r.status_code, body=r.content, headers=dict(r.headers))

    def close(self) -> None:
        self._client.close()


class AsyncHttpxTransport:
    """Production async transport backed by httpx."""

    def __init__(self, base_url: str, api_key: str, timeout: float = 30.0):
        import httpx

        self._client = httpx.AsyncClient(
            base_url=base_url,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=timeout,
        )

    async def post(self, path: str, *, files: dict[str, tuple[str, bytes, str]]) -> Response:
        r = await self._client.post(path, files=files)
        return Response(status_code=r.status_code, body=r.content, headers=dict(r.headers))

    async def get(self, path: str) -> Response:
        r = await self._client.get(path)
        return Response(status_code=r.status_code, body=r.content, headers=dict(r.headers))

    async def delete(self, path: str) -> Response:
        r = await self._client.delete(path)
        return Response(status_code=r.status_code, body=r.content, headers=dict(r.headers))

    async def close(self) -> None:
        await self._client.aclose()
