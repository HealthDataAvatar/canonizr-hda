"""Unit tests for MIME reconciliation — the trust boundary between magic and client."""

import pytest

from app.mimetypes import is_archive_type, is_known_mime_type, reconcile_mime

DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
EPUB = "application/epub+zip"
ODT = "application/vnd.oasis.opendocument.text"


class TestReconcileMime:
    # --- magic makes a concrete identification: it is authoritative ---
    @pytest.mark.parametrize(
        "detected,client",
        [
            ("application/pdf", "application/pdf"),
            ("application/pdf", DOCX),  # client cannot relabel a positively-detected pdf
            ("image/png", "image/jpeg"),
            ("text/html", "text/plain"),
            ("application/gzip", "application/pdf"),  # non-zip archive — client lie ignored
            ("application/x-7z-compressed", DOCX),
        ],
    )
    def test_concrete_detection_wins(self, detected, client):
        assert reconcile_mime(detected, client) == detected

    # --- the archive-as-PDF bypass is closed ---
    def test_zip_detected_cannot_be_relabeled_as_pdf(self):
        assert reconcile_mime("application/zip", "application/pdf") == "application/zip"
        # and that result is still an archive → rejected downstream
        assert is_archive_type(reconcile_mime("application/zip", "application/pdf"))

    def test_real_zip_stays_zip(self):
        assert reconcile_mime("application/zip", "application/zip") == "application/zip"

    def test_zip_with_no_client_hint_stays_zip(self):
        assert reconcile_mime("application/zip", "") == "application/zip"

    # --- zip-container office docs (magic can't see inside) are preserved ---
    @pytest.mark.parametrize("office", [DOCX, XLSX, EPUB, ODT])
    def test_zip_container_office_types_honoured(self, office):
        assert reconcile_mime("application/zip", office) == office
        assert not is_archive_type(office)

    # --- octet-stream: magic is blind; trust a KNOWN client type only ---
    def test_octet_stream_trusts_known_client_type(self):
        assert reconcile_mime("application/octet-stream", DOCX) == DOCX
        assert reconcile_mime("application/octet-stream", "image/heic") == "image/heic"
        assert is_known_mime_type("image/heic")

    def test_octet_stream_rejects_unknown_client_type(self):
        assert reconcile_mime("application/octet-stream", "application/zip") == "application/octet-stream"
        assert reconcile_mime("application/octet-stream", "") == "application/octet-stream"

    def test_octet_stream_cannot_smuggle_archive(self):
        # client claims a real archive type for an unidentifiable blob → not honoured
        assert reconcile_mime("application/octet-stream", "application/x-tar") == "application/octet-stream"
