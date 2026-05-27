"""End-to-end tests for queue mode — file goes through gateway → Redis → worker → back."""
import requests

from conftest import GATEWAY_URL, TIMEOUT, make_pdf


class TestQueueRoundTrip:
    def test_pdf_returns_markdown(self):
        pdf_bytes = make_pdf("Queue round-trip test document.")
        resp = requests.post(
            f"{GATEWAY_URL}/convert",
            files={"file": ("test.pdf", pdf_bytes, "application/pdf")},
            timeout=TIMEOUT,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "markdown" in data
        assert "Queue round-trip test document" in data["markdown"]

    def test_html_passthrough(self):
        resp = requests.post(
            f"{GATEWAY_URL}/convert",
            files={"file": ("test.html", b"<h1>Hello</h1>", "text/html")},
            timeout=TIMEOUT,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "markdown" in data
        assert "Hello" in data["markdown"]

    def test_plain_text_passthrough(self):
        resp = requests.post(
            f"{GATEWAY_URL}/convert",
            files={"file": ("test.txt", b"Plain text content", "text/plain")},
            timeout=TIMEOUT,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "Plain text content" in data["markdown"]
