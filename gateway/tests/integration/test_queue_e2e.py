"""End-to-end tests for queue mode — file goes through gateway → Redis → worker → back."""

from tests.integration.conftest import assert_canonize_ok, find_artefact, make_pdf, submit_and_poll


class TestQueueRoundTrip:
    def test_pdf_returns_artefacts(self, test_sub):
        pdf_bytes = make_pdf("Queue round-trip test document.")
        _, result = submit_and_poll(
            files={"file": ("test.pdf", pdf_bytes, "application/pdf")},
            sub_id=test_sub,
        )
        assert result.status_code == 200
        artefacts = assert_canonize_ok(result.json())
        assert find_artefact(artefacts, "markdown") is not None

    def test_html_converted(self, test_sub):
        _, result = submit_and_poll(
            files={"file": ("test.html", b"<h1>Hello</h1>", "text/html")},
            sub_id=test_sub,
        )
        assert result.status_code == 200
        artefacts = assert_canonize_ok(result.json())
        assert find_artefact(artefacts, "markdown") is not None

    def test_plain_text_passthrough(self, test_sub):
        _, result = submit_and_poll(
            files={"file": ("test.txt", b"Plain text content", "text/plain")},
            sub_id=test_sub,
        )
        assert result.status_code == 200
        artefacts = assert_canonize_ok(result.json())
        assert find_artefact(artefacts, "markdown") is not None
