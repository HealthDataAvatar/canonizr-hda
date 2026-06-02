"""Smoke tests against a live deployment."""

import requests

from tests.smoke.conftest import FIXTURES, GATEWAY_URL, TIMEOUT, submit_and_poll


def test_health(headers):
    resp = requests.get(f"{GATEWAY_URL}/health", headers=headers, timeout=TIMEOUT)
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_submit_html(headers):
    submit, result = submit_and_poll(
        files={"file": ("test.html", b"<h1>Hello</h1>", "text/html")},
        headers=headers,
    )
    assert submit.status_code == 202
    body = submit.json()
    assert "job_id" in body
    assert "estimated_seconds" in body
    assert result is not None
    assert result.status_code == 200
    assert "Hello" in result.json()["markdown"]


def test_submit_plain_text(headers):
    submit, result = submit_and_poll(
        files={"file": ("test.txt", b"Smoke test content", "text/plain")},
        headers=headers,
    )
    assert submit.status_code == 202
    assert result is not None
    assert result.status_code == 200
    assert "Smoke test content" in result.json()["markdown"]


def test_submit_pdf(headers):
    with open(FIXTURES / "test-tiny.pdf", "rb") as f:
        submit, result = submit_and_poll(
            files={"file": ("test.pdf", f, "application/pdf")},
            headers=headers,
        )
    assert submit.status_code == 202
    assert result is not None
    assert result.status_code == 200
    assert "Hello world" in result.json()["markdown"]


def test_billing_headers(headers):
    submit, result = submit_and_poll(
        files={"file": ("test.txt", b"Check headers", "text/plain")},
        headers=headers,
    )
    assert submit.status_code == 202
    assert result is not None
    assert result.status_code == 200
    assert "X-Input-Size-Bytes" in result.headers
    assert "X-Processing-Pipeline" in result.headers


def test_oversized_file_rejected(headers):
    resp = requests.post(
        f"{GATEWAY_URL}/v1/jobs",
        files={"file": ("big.txt", b"x" * (60 * 1024 * 1024), "text/plain")},
        headers=headers,
        timeout=TIMEOUT,
    )
    assert resp.status_code == 413
