"""Smoke tests against a live deployment."""

import requests
from conftest import FIXTURES, GATEWAY_URL, TIMEOUT


def test_health(headers):
    resp = requests.get(f"{GATEWAY_URL}/health", headers=headers, timeout=TIMEOUT)
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_convert_html(headers):
    resp = requests.post(
        f"{GATEWAY_URL}/convert",
        files={"file": ("test.html", b"<h1>Hello</h1>", "text/html")},
        headers=headers,
        timeout=TIMEOUT,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "markdown" in data
    assert "Hello" in data["markdown"]


def test_convert_plain_text(headers):
    resp = requests.post(
        f"{GATEWAY_URL}/convert",
        files={"file": ("test.txt", b"Smoke test content", "text/plain")},
        headers=headers,
        timeout=TIMEOUT,
    )
    assert resp.status_code == 200
    assert "Smoke test content" in resp.json()["markdown"]


def test_convert_pdf(headers):
    """Requires Docling — verifies the full pipeline."""
    with open(FIXTURES / "test-tiny.pdf", "rb") as f:
        resp = requests.post(
            f"{GATEWAY_URL}/convert",
            files={"file": ("test.pdf", f, "application/pdf")},
            headers=headers,
            timeout=TIMEOUT,
        )
    assert resp.status_code == 200
    assert "Hello world" in resp.json()["markdown"]


def test_billing_headers_present(headers):
    resp = requests.post(
        f"{GATEWAY_URL}/convert",
        files={"file": ("test.txt", b"Check headers", "text/plain")},
        headers=headers,
        timeout=TIMEOUT,
    )
    assert resp.status_code == 200
    assert "X-Input-Size-Bytes" in resp.headers or "metadata" in resp.json()


def test_oversized_file_rejected(headers):
    # 60MB should exceed the 50MB limit
    resp = requests.post(
        f"{GATEWAY_URL}/convert",
        files={"file": ("big.txt", b"x" * (60 * 1024 * 1024), "text/plain")},
        headers=headers,
        timeout=TIMEOUT,
    )
    assert resp.status_code == 413
