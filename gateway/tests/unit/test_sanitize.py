"""Unit tests for input sanitization."""

from app.sanitize import is_known_mime_type, sanitize_filename


class TestSanitizeFilename:
    def test_simple_filename(self):
        assert sanitize_filename("report.pdf") == "report.pdf"

    def test_strips_directory_traversal_unix(self):
        assert sanitize_filename("../../etc/passwd") == "passwd"

    def test_strips_directory_traversal_windows(self):
        assert sanitize_filename("C:\\Users\\admin\\doc.docx") == "doc.docx"

    def test_strips_mixed_path(self):
        assert sanitize_filename("/var/uploads\\..\\secret/file.txt") == "file.txt"

    def test_removes_control_characters(self):
        assert sanitize_filename("file\x00name\x01.pdf") == "filename.pdf"

    def test_removes_null_bytes(self):
        assert sanitize_filename("file\x00.pdf") == "file.pdf"

    def test_truncates_to_255(self):
        long_name = "a" * 300 + ".pdf"
        result = sanitize_filename(long_name)
        assert len(result) <= 255

    def test_empty_string_returns_document(self):
        assert sanitize_filename("") == "document"

    def test_only_dots_returns_document(self):
        assert sanitize_filename("...") == "document"

    def test_only_whitespace_returns_document(self):
        assert sanitize_filename("   ") == "document"

    def test_hidden_file_dots_stripped(self):
        assert sanitize_filename(".hidden") == "hidden"

    def test_preserves_unicode_filenames(self):
        assert sanitize_filename("документ.pdf") == "документ.pdf"

    def test_preserves_spaces_in_name(self):
        assert sanitize_filename("my report.pdf") == "my report.pdf"

    def test_strips_trailing_whitespace(self):
        assert sanitize_filename("file.pdf   ") == "file.pdf"


class TestIsKnownMimeType:
    def test_pdf(self):
        assert is_known_mime_type("application/pdf")

    def test_plain_text(self):
        assert is_known_mime_type("text/plain")

    def test_html(self):
        assert is_known_mime_type("text/html")

    def test_docx(self):
        assert is_known_mime_type("application/vnd.openxmlformats-officedocument.wordprocessingml.document")

    def test_legacy_doc(self):
        assert is_known_mime_type("application/msword")

    def test_png(self):
        assert is_known_mime_type("image/png")

    def test_jpeg(self):
        assert is_known_mime_type("image/jpeg")

    def test_unknown(self):
        assert not is_known_mime_type("application/octet-stream")

    def test_video(self):
        assert not is_known_mime_type("video/mp4")
