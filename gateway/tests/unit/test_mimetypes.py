"""Unit tests for MIME reconciliation — magic wins when sure, client's type when not."""

import pytest

from app.mimetypes import is_archive_type, reconcile_mime

DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


class TestReconcileMime:
    # --- magic positively identified the format → it wins (prevents silent mis-routing) ---
    @pytest.mark.parametrize(
        "detected,client",
        [
            ("application/pdf", "application/pdf"),
            ("application/pdf", "text/plain"),  # a real PDF misnamed .txt routes as PDF, not garbage
            (DOCX, "application/octet-stream"),  # libmagic IDs office docs specifically
            (XLSX, "text/plain"),
            ("image/png", "image/jpeg"),
        ],
    )
    def test_confident_detection_wins(self, detected, client):
        assert reconcile_mime(detected, client) == detected

    # --- magic inconclusive → trust the client's declared (extension-derived) type ---
    @pytest.mark.parametrize(
        "detected",
        ["", "text/plain", "application/octet-stream", "application/zip", "application/x-empty", "inode/x-empty"],
    )
    def test_generic_detection_defers_to_client(self, detected):
        assert reconcile_mime(detected, "text/markdown") == "text/markdown"

    # --- empty file: magic says x-empty, client says text → accepted as text ---
    def test_empty_file_accepted_as_declared_text(self):
        assert reconcile_mime("application/x-empty", "text/plain") == "text/plain"

    # --- archives: magic can't reliably ID them (real zip → octet-stream), so the
    #     declared archive type carries through to be rejected downstream ---
    @pytest.mark.parametrize("detected", ["text/plain", "application/octet-stream", "application/zip"])
    @pytest.mark.parametrize("archive", ["application/zip", "application/x-tar", "application/vnd.rar"])
    def test_declared_archive_carries_through(self, detected, archive):
        out = reconcile_mime(detected, archive)
        assert out == archive
        assert is_archive_type(out)  # → handler rejects it

    # --- office doc on an OLDER libmagic that only sees a bare zip is still routed right ---
    def test_office_doc_seen_as_zip_uses_client_type(self):
        assert reconcile_mime("application/zip", DOCX) == DOCX
        assert not is_archive_type(DOCX)

    # --- no client hint → fall back to whatever magic said ---
    def test_falls_back_to_detected_without_client(self):
        assert reconcile_mime("application/octet-stream", "") == "application/octet-stream"
        assert reconcile_mime("application/pdf", "") == "application/pdf"
