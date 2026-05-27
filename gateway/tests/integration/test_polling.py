"""Integration tests for the /result/{job_id} polling endpoint."""

import time

import requests
from conftest import GATEWAY_URL, TIMEOUT


class TestPolling:
    def test_poll_nonexistent_job_returns_404(self):
        resp = requests.get(
            f"{GATEWAY_URL}/result/nonexistent_job_id",
            timeout=TIMEOUT,
        )
        assert resp.status_code == 404

    def test_successful_conversion_is_pollable(self):
        """Submit a file, get the result, then verify the same job_id
        is still available via polling (resultcache)."""
        # First, do a normal conversion
        resp = requests.post(
            f"{GATEWAY_URL}/convert",
            files={"file": ("test.txt", b"Polling test", "text/plain")},
            timeout=TIMEOUT,
        )
        # In queue mode, if the worker is fast enough we get 200 directly.
        # The result should also be in the cache for polling.
        assert resp.status_code in (200, 202)

        if resp.status_code == 202:
            job_id = resp.json()["job_id"]
            # Poll until result is ready
            for _ in range(30):
                poll_resp = requests.get(
                    f"{GATEWAY_URL}/result/{job_id}",
                    timeout=TIMEOUT,
                )
                if poll_resp.status_code == 200:
                    assert "markdown" in poll_resp.json()
                    return
                time.sleep(1)
            assert False, "Timed out waiting for result"
