"""Smoke test configuration — requires API_KEY env var."""

import os
import sys
import time
from pathlib import Path

import pytest
import requests

GATEWAY_URL = os.environ.get("GATEWAY_URL", "https://api.canonizr.com")
API_KEY = os.environ.get("API_KEY", "")
FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"
TIMEOUT = 120
POLL_INTERVAL = 1


def pytest_configure(config):
    if not API_KEY:
        sys.exit("Smoke tests require env var: API_KEY")


@pytest.fixture
def headers():
    return {"Authorization": f"Bearer {API_KEY}"}


def submit_and_poll(files, headers, timeout=TIMEOUT):
    """Submit a file and poll until result is ready. Returns (submit_resp, result_resp)."""
    submit = requests.post(f"{GATEWAY_URL}/v1/jobs", files=files, headers=headers, timeout=timeout)
    if submit.status_code != 202:
        return submit, None

    poll_url = submit.json().get("poll_url", "")
    if not poll_url:
        return submit, None

    result = None
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        result = requests.get(f"{GATEWAY_URL}{poll_url}", headers=headers, timeout=timeout)
        if result.status_code != 202:
            return submit, result
        time.sleep(POLL_INTERVAL)

    return submit, result
