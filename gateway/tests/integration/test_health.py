"""Basic gateway health checks."""

import requests

from tests.integration.conftest import GATEWAY_URL


def test_health_check():
    r = requests.get(f"{GATEWAY_URL}/health", timeout=5)
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
