"""Smoke tests against a live deployment."""

import requests
from conftest import FIXTURES, GATEWAY_URL, TIMEOUT, submit_and_poll


def test_health(headers):
    resp = requests.get(f"{GATEWAY_URL}/health", headers=headers, timeout=TIMEOUT)
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_convert_html(headers):
    submit, result = submit_and_poll(
        files={"file": ("test.html", b"<h1>Hello</h1>", "text/html")},
        headers=headers,
    )
    assert submit.status_code == 202
    assert "job_id" in submit.json()
    assert "estimated_seconds" in submit.json()
    assert result.status_code == 200
    assert "Hello" in result.json()["markdown"]


def test_convert_plain_text(headers):
    submit, result = submit_and_poll(
        files={"file": ("test.txt", b"Smoke test content", "text/plain")},
        headers=headers,
    )
    assert submit.status_code == 202
    assert result.status_code == 200
    assert "Smoke test content" in result.json()["markdown"]


def test_convert_pdf(headers):
    """Requires Docling — verifies the full pipeline."""
    with open(FIXTURES / "test-tiny.pdf", "rb") as f:
        submit, result = submit_and_poll(
            files={"file": ("test.pdf", f, "application/pdf")},
            headers=headers,
        )
    assert submit.status_code == 202
    assert result.status_code == 200
    assert "Hello world" in result.json()["markdown"]


def test_result_has_billing_headers(headers):
    """Billing headers should be present on the /result response."""
    submit, result = submit_and_poll(
        files={"file": ("test.txt", b"Check headers", "text/plain")},
        headers=headers,
    )
    assert submit.status_code == 202
    assert result.status_code == 200
    assert "X-Input-Size-Bytes" in result.headers
    assert "X-Processing-Pipeline" in result.headers


def test_oversized_file_rejected(headers):
    resp = requests.post(
        f"{GATEWAY_URL}/convert",
        files={"file": ("big.txt", b"x" * (60 * 1024 * 1024), "text/plain")},
        headers=headers,
        timeout=TIMEOUT,
    )
    assert resp.status_code == 413
