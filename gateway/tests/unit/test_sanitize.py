"""Unit tests for input sanitization."""

from app.sanitize import content_disposition, is_known_mime_type, sanitize_filename


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

    def test_spaces_replaced_with_underscore(self):
        assert sanitize_filename("my report.pdf") == "my_report.pdf"

    def test_strips_trailing_whitespace(self):
        assert sanitize_filename("file.pdf   ") == "file.pdf"

    def test_double_quotes_replaced(self):
        assert sanitize_filename('file"name.pdf') == "file_name.pdf"

    def test_semicolons_replaced(self):
        assert sanitize_filename("file;name.pdf") == "file_name.pdf"

    def test_single_quotes_replaced(self):
        assert sanitize_filename("file'name.pdf") == "file_name.pdf"

    def test_parentheses_replaced(self):
        assert sanitize_filename("file(1).pdf") == "file_1_.pdf"

    def test_combining_accent_normalised(self):
        # i + combining acute accent → í (NFC)
        assert sanitize_filename("gui\u0301a.pdf") == "guía.pdf"


class TestContentDisposition:
    def test_ascii_filename(self):
        assert content_disposition("report.pdf") == 'attachment; filename="report.pdf"'

    def test_latin1_filename(self):
        assert content_disposition("café.pdf") == 'attachment; filename="café.pdf"'

    def test_non_latin1_uses_rfc5987(self):
        result = content_disposition("报告.pdf")
        assert 'filename="' in result
        assert "filename*=UTF-8''" in result

    def test_combining_accent_normalised_to_latin1(self):
        # NFC normalises i + combining accent → í (latin-1 safe)
        result = content_disposition("gui\u0301a.pdf")
        assert result == 'attachment; filename="guía.pdf"'

    def test_empty_falls_back_to_document(self):
        assert content_disposition("") == 'attachment; filename="document"'

    def test_none_falls_back_to_document(self):
        assert content_disposition(None) == 'attachment; filename="document"'


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
