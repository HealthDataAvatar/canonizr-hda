"""Test error handling."""

import io

import requests
from conftest import GATEWAY_URL, TIMEOUT, submit_and_poll


def test_unsupported_format(test_sub):
    garbage = b"\x00\x01\x02\x03\x04\x05\x06\x07"
    r = requests.post(
        f"{GATEWAY_URL}/convert",
        files={"file": ("test.xyz", io.BytesIO(garbage), "application/octet-stream")},
        headers={"X-Subscription-Id": test_sub},
        timeout=TIMEOUT,
    )
    assert r.status_code == 400


def test_file_too_large(test_sub):
    large_data = b"\x00" * (51 * 1024 * 1024)
    r = requests.post(
        f"{GATEWAY_URL}/convert",
        files={"file": ("large.pdf", io.BytesIO(large_data), "application/pdf")},
        headers={"X-Subscription-Id": test_sub},
        timeout=TIMEOUT,
    )
    assert r.status_code == 413


def test_empty_file(test_sub):
    submit, result = submit_and_poll(
        files={"file": ("empty.txt", io.BytesIO(b""), "text/plain")},
        sub_id=test_sub,
    )
    assert submit.status_code == 202
    assert result.status_code == 200


def test_missing_subscription_returns_401():
    r = requests.post(
        f"{GATEWAY_URL}/convert",
        files={"file": ("test.txt", b"hello", "text/plain")},
        timeout=TIMEOUT,
    )
    assert r.status_code == 401
