"""Test error handling."""

import io

import requests
from conftest import GATEWAY_URL, TIMEOUT, submit_and_poll


def test_unsupported_format():
    garbage = b"\x00\x01\x02\x03\x04\x05\x06\x07"
    submit, result = submit_and_poll(
        files={"file": ("test.xyz", io.BytesIO(garbage), "application/octet-stream")},
    )
    assert submit.status_code == 202
    # Worker should return an error for unsupported format
    assert result.status_code == 500
    assert result.json()["status"] == "error"


def test_file_too_large():
    large_data = b"\x00" * (51 * 1024 * 1024)
    r = requests.post(
        f"{GATEWAY_URL}/convert",
        files={"file": ("large.pdf", io.BytesIO(large_data), "application/pdf")},
        timeout=TIMEOUT,
    )
    assert r.status_code == 413
    assert "too large" in r.json()["detail"].lower()


def test_empty_file():
    submit, result = submit_and_poll(
        files={"file": ("empty.txt", io.BytesIO(b""), "text/plain")},
    )
    assert submit.status_code == 202
    # Empty file — worker should return error
    assert result.status_code == 500
    assert result.json()["status"] == "error"
