"""Integration tests for polling and deletion."""

import requests

from tests.integration.conftest import GATEWAY_URL, TIMEOUT, assert_canonize_ok, submit_and_poll


class TestPolling:
    def test_poll_nonexistent_job_returns_202(self, test_sub):
        resp = requests.get(
            f"{GATEWAY_URL}/v1/canonize/nonexistent_job_id",
            headers={"Authorization": f"Bearer {test_sub.api_key}"},
            timeout=TIMEOUT,
        )
        assert resp.status_code == 202

    def test_poll_without_auth_returns_401(self):
        resp = requests.get(f"{GATEWAY_URL}/v1/canonize/some_job_id", timeout=TIMEOUT)
        assert resp.status_code == 401

    def test_poll_other_users_job_not_confirmable(self, test_sub, second_sub):
        submit, result = submit_and_poll(
            files={"file": ("test.txt", b"Owned by first user", "text/plain")},
            api_key=test_sub.api_key,
        )
        assert result.status_code == 200
        job_id = submit.json()["job_id"]
        # A different subscription must not see the job — same 202 as unknown id.
        resp = requests.get(
            f"{GATEWAY_URL}/v1/canonize/{job_id}",
            headers={"Authorization": f"Bearer {second_sub.api_key}"},
            timeout=TIMEOUT,
        )
        assert resp.status_code == 202
        assert "artefacts" not in resp.json()

    def test_successful_conversion_is_pollable(self, test_sub):
        submit, result = submit_and_poll(
            files={"file": ("test.txt", b"Polling test", "text/plain")},
            api_key=test_sub.api_key,
        )
        assert submit.status_code == 202
        assert result.status_code == 200
        assert_canonize_ok(result.json())

    def test_result_available_on_repeated_poll(self, test_sub):
        submit, result = submit_and_poll(
            files={"file": ("test.txt", b"Repeat poll test", "text/plain")},
            api_key=test_sub.api_key,
        )
        assert result.status_code == 200

        poll_url = submit.json()["poll_url"]
        second = requests.get(
            f"{GATEWAY_URL}{poll_url}",
            headers={"Authorization": f"Bearer {test_sub.api_key}"},
            timeout=TIMEOUT,
        )
        assert second.status_code == 200
        # Same artefacts on repeated poll
        assert second.json()["artefacts"] == result.json()["artefacts"]


class TestDelete:
    def test_delete_returns_204(self, test_sub):
        submit, result = submit_and_poll(
            files={"file": ("test.txt", b"Delete me", "text/plain")},
            api_key=test_sub.api_key,
        )
        assert result.status_code == 200

        job_id = submit.json()["job_id"]
        resp = requests.delete(
            f"{GATEWAY_URL}/v1/canonize/{job_id}",
            headers={"Authorization": f"Bearer {test_sub.api_key}"},
            timeout=TIMEOUT,
        )
        assert resp.status_code == 204

    def test_poll_after_delete_returns_410(self, test_sub):
        submit, result = submit_and_poll(
            files={"file": ("test.txt", b"Delete then poll", "text/plain")},
            api_key=test_sub.api_key,
        )
        assert result.status_code == 200

        job_id = submit.json()["job_id"]
        requests.delete(
            f"{GATEWAY_URL}/v1/canonize/{job_id}",
            headers={"Authorization": f"Bearer {test_sub.api_key}"},
            timeout=TIMEOUT,
        )

        poll = requests.get(
            f"{GATEWAY_URL}/v1/canonize/{job_id}",
            headers={"Authorization": f"Bearer {test_sub.api_key}"},
            timeout=TIMEOUT,
        )
        assert poll.status_code == 410

    def test_delete_nonexistent_returns_404(self, test_sub):
        resp = requests.delete(
            f"{GATEWAY_URL}/v1/canonize/nonexistent_job_id",
            headers={"Authorization": f"Bearer {test_sub.api_key}"},
            timeout=TIMEOUT,
        )
        assert resp.status_code == 404

    def test_delete_without_subscription_returns_401(self):
        resp = requests.delete(
            f"{GATEWAY_URL}/v1/canonize/some_job_id",
            timeout=TIMEOUT,
        )
        assert resp.status_code == 401
