"""End-to-end tests for queue mode — file goes through gateway → Redis → worker → back."""

from conftest import make_pdf, submit_and_poll


class TestQueueRoundTrip:
    def test_pdf_returns_markdown(self):
        pdf_bytes = make_pdf("Queue round-trip test document.")
        submit, result = submit_and_poll(
            files={"file": ("test.pdf", pdf_bytes, "application/pdf")},
        )
        assert submit.status_code == 202
        assert result.status_code == 200
        data = result.json()
        assert "markdown" in data
        assert "Queue round-trip test document" in data["markdown"]

    def test_html_converted_to_markdown(self):
        submit, result = submit_and_poll(
            files={"file": ("test.html", b"<h1>Hello</h1>", "text/html")},
        )
        assert submit.status_code == 202
        assert result.status_code == 200
        data = result.json()
        assert "markdown" in data
        assert "Hello" in data["markdown"]
        assert "markitdown" in data["metadata"]["actions"]

    def test_plain_text_passthrough(self):
        submit, result = submit_and_poll(
            files={"file": ("test.txt", b"Plain text content", "text/plain")},
        )
        assert submit.status_code == 202
        assert result.status_code == 200
        data = result.json()
        assert "Plain text content" in data["markdown"]
