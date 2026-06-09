"""Image captioning via OpenAI-compatible vision API."""

import base64
import json
import logging
import os
import time
from dataclasses import dataclass

import httpx

from ..prompts import IMAGE
from ..tracing import Span
from ..types import Markdown, VlmImagePNG
from .retry import request_with_retry

logger = logging.getLogger(__name__)

ENDPOINT = os.environ.get("CAPTIONING_ENDPOINT") or "http://captioning:8080/v1/chat/completions"
API_KEY = os.environ.get("CAPTIONING_API_KEY", "")
API_MODEL = os.environ.get("CAPTIONING_API_MODEL", "")
_api_params_raw = os.environ.get("CAPTIONING_API_PARAMS", "")
API_PARAMS: dict = json.loads(_api_params_raw) if _api_params_raw else {"max_tokens": 1024}


def is_available() -> bool:
    return os.environ.get("CAPTIONING_ENABLED", "true").lower() == "true"


@dataclass
class _VisionResponse:
    """Internal: parsed response from the vision API."""

    text: str
    prompt_tokens: int = 0
    completion_tokens: int = 0


async def _call(image_b64: str, deadline: float, parent: Span) -> _VisionResponse:
    """Send a base64 PNG to the vision service."""
    payload: dict = {
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/png;base64,{image_b64}"},
                    },
                    {
                        "type": "text",
                        "text": IMAGE,
                    },
                ],
            }
        ],
        **API_PARAMS,
    }
    if API_MODEL:
        payload["model"] = API_MODEL

    headers = {}
    if API_KEY:
        headers["Authorization"] = f"Bearer {API_KEY}"

    payload_bytes = len(json.dumps(payload))

    http_span = Span(name="http_request", attributes={"payload_bytes": payload_bytes, "model": API_MODEL or "unknown"})
    http_span._start = time.monotonic()
    parent.children.append(http_span)

    async with httpx.AsyncClient() as client:
        response = await request_with_retry(
            client,
            "POST",
            ENDPOINT,
            deadline=deadline,
            service_name="captioning",
            span=http_span,
            json=payload,
            headers=headers,
        )

    http_span._end = time.monotonic()

    raw = response.json()
    text = raw.get("choices", [{}])[0].get("message", {}).get("content", "")
    usage = raw.get("usage", {})

    return _VisionResponse(
        text=text,
        prompt_tokens=usage.get("prompt_tokens", 0),
        completion_tokens=usage.get("completion_tokens", 0),
    )


class OpenAIImageCaptioner:
    """ImageCaptioner implementation backed by an OpenAI-compatible vision API.

    Token counts are recorded in the span, not the return value.
    """

    def is_available(self) -> bool:
        return is_available()

    async def caption(self, image: VlmImagePNG, deadline: float, span: Span) -> Markdown:
        image_b64 = base64.b64encode(image.data).decode("utf-8")
        result = await _call(image_b64, deadline, span)
        span.set(
            prompt_tokens=result.prompt_tokens,
            completion_tokens=result.completion_tokens,
        )
        return Markdown(result.text)
