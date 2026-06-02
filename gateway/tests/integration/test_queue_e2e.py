"""End-to-end tests for queue mode — file goes through gateway → Redis → worker → back."""

from tests.integration.conftest import make_pdf, submit_and_poll


class TestQueueRoundTrip:
    def test_pdf_returns_markdown(self, test_sub):
        pdf_bytes = make_pdf("Queue round-trip test document.")
        submit, result = submit_and_poll(
            files={"file": ("test.pdf", pdf_bytes, "application/pdf")},
            sub_id=test_sub,
        )
        assert submit.status_code == 202
        assert result.status_code == 200
        data = result.json()
        assert "Queue round-trip test document" in data["markdown"]

    def test_html_converted_to_markdown(self, test_sub):
        submit, result = submit_and_poll(
            files={"file": ("test.html", b"<h1>Hello</h1>", "text/html")},
            sub_id=test_sub,
        )
        assert submit.status_code == 202
        assert result.status_code == 200
        assert "Hello" in result.json()["markdown"]
        assert "markitdown" in result.json()["metadata"]["actions"]

    def test_plain_text_passthrough(self, test_sub):
        submit, result = submit_and_poll(
            files={"file": ("test.txt", b"Plain text content", "text/plain")},
            sub_id=test_sub,
        )
        assert submit.status_code == 202
        assert result.status_code == 200
        assert "Plain text content" in result.json()["markdown"]
