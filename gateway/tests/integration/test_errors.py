"""Test error handling."""

import io

import requests

from tests.integration.conftest import GATEWAY_URL, TIMEOUT, submit_and_poll


def test_unsupported_format(test_sub):
    garbage = b"\x00\x01\x02\x03\x04\x05\x06\x07"
    r = requests.post(
        f"{GATEWAY_URL}/v1/jobs",
        files={"file": ("test.xyz", io.BytesIO(garbage), "application/octet-stream")},
        headers={"Authorization": f"Bearer {test_sub.api_key}"},
        timeout=TIMEOUT,
    )
    assert r.status_code == 400


def test_file_too_large(test_sub):
    large_data = b"\x00" * (51 * 1024 * 1024)
    r = requests.post(
        f"{GATEWAY_URL}/v1/jobs",
        files={"file": ("large.pdf", io.BytesIO(large_data), "application/pdf")},
        headers={"Authorization": f"Bearer {test_sub.api_key}"},
        timeout=TIMEOUT,
    )
    assert r.status_code == 413


def test_empty_file(test_sub):
    submit, result = submit_and_poll(
        files={"file": ("empty.txt", io.BytesIO(b""), "text/plain")},
        api_key=test_sub.api_key,
    )
    assert submit.status_code == 202
    assert result.status_code == 200


def test_missing_subscription_returns_401():
    r = requests.post(
        f"{GATEWAY_URL}/v1/jobs",
        files={"file": ("test.txt", b"hello", "text/plain")},
        timeout=TIMEOUT,
    )
    assert r.status_code == 401


class TestArchiveRejection:
    """Archives should be rejected with a clear message telling users to extract first."""

    ARCHIVE_CASES = [
        ("test.zip", "application/zip"),
        ("test.tar", "application/x-tar"),
        ("test.tar.gz", "application/gzip"),
        ("test.7z", "application/x-7z-compressed"),
        ("test.rar", "application/vnd.rar"),
    ]

    def _submit(self, filename, mime, test_sub):
        return requests.post(
            f"{GATEWAY_URL}/v1/jobs",
            files={"file": (filename, b"fake-archive-bytes", mime)},
            headers={"Authorization": f"Bearer {test_sub.api_key}"},
            timeout=TIMEOUT,
        )

    def test_zip_rejected(self, test_sub):
        r = self._submit("test.zip", "application/zip", test_sub)
        assert r.status_code == 400
        assert "Archive files" in r.json()["detail"]
        assert "submit each file individually" in r.json()["detail"]

    def test_tar_rejected(self, test_sub):
        r = self._submit("test.tar", "application/x-tar", test_sub)
        assert r.status_code == 400
        assert "Archive files" in r.json()["detail"]

    def test_7z_rejected(self, test_sub):
        r = self._submit("test.7z", "application/x-7z-compressed", test_sub)
        assert r.status_code == 400
        assert "Archive files" in r.json()["detail"]

    def test_rar_rejected(self, test_sub):
        r = self._submit("test.rar", "application/vnd.rar", test_sub)
        assert r.status_code == 400
        assert "Archive files" in r.json()["detail"]

    def test_gzip_rejected(self, test_sub):
        r = self._submit("test.tar.gz", "application/gzip", test_sub)
        assert r.status_code == 400
        assert "Archive files" in r.json()["detail"]
