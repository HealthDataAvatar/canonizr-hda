"""Smoke test configuration — requires APIM_KEY env var."""

import os
import sys
from pathlib import Path

import pytest

GATEWAY_URL = os.environ.get("GATEWAY_URL", "https://apim-canonizr-prod.azure-api.net")
APIM_KEY = os.environ.get("APIM_KEY", "")
FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"
TIMEOUT = 120


def pytest_configure(config):
    if not APIM_KEY:
        sys.exit("Smoke tests require env var: APIM_KEY")


@pytest.fixture
def headers():
    return {"Ocp-Apim-Subscription-Key": APIM_KEY}
