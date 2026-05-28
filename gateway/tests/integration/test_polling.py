"""Integration tests for the /result/{job_id} polling endpoint."""

import requests
from conftest import GATEWAY_URL, TIMEOUT, submit_and_poll


class TestPolling:
    def test_poll_nonexistent_job_returns_202(self):
        resp = requests.get(f"{GATEWAY_URL}/result/nonexistent_job_id", timeout=TIMEOUT)
        assert resp.status_code == 202

    def test_successful_conversion_is_pollable(self, test_sub):
        submit, result = submit_and_poll(
            files={"file": ("test.txt", b"Polling test", "text/plain")},
            sub_id=test_sub,
        )
        assert submit.status_code == 202
        assert result.status_code == 200
        assert "markdown" in result.json()

    def test_result_available_on_repeated_poll(self, test_sub):
        submit, result = submit_and_poll(
            files={"file": ("test.txt", b"Repeat poll test", "text/plain")},
            sub_id=test_sub,
        )
        assert result.status_code == 200

        poll_url = submit.json()["poll_url"]
        second = requests.get(f"{GATEWAY_URL}{poll_url}", timeout=TIMEOUT)
        assert second.status_code == 200
        assert second.json()["markdown"] == result.json()["markdown"]
