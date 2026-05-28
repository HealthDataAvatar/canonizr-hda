"""Integration tests for the /result/{job_id} polling endpoint."""

import requests
from conftest import GATEWAY_URL, TIMEOUT, submit_and_poll


class TestPolling:
    def test_poll_nonexistent_job_returns_202(self):
        """Unknown job IDs return 202 (processing) — the client will eventually give up."""
        resp = requests.get(
            f"{GATEWAY_URL}/result/nonexistent_job_id",
            timeout=TIMEOUT,
        )
        assert resp.status_code == 202

    def test_successful_conversion_is_pollable(self):
        """Submit a file, poll for result, verify it's available."""
        submit, result = submit_and_poll(
            files={"file": ("test.txt", b"Polling test", "text/plain")},
        )
        assert submit.status_code == 202
        assert result.status_code == 200
        assert "markdown" in result.json()

    def test_result_available_on_repeated_poll(self):
        """Result should be available on multiple polls (no delete-on-read)."""
        submit, result = submit_and_poll(
            files={"file": ("test.txt", b"Repeat poll test", "text/plain")},
        )
        assert result.status_code == 200

        # Poll again — should still return 200
        poll_url = submit.json()["poll_url"]
        second = requests.get(f"{GATEWAY_URL}{poll_url}", timeout=TIMEOUT)
        assert second.status_code == 200
        assert second.json()["markdown"] == result.json()["markdown"]
