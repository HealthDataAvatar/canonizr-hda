"""Tests that the canonize API returns correctly shaped responses for each input type.

These tests verify the response structure (status, artefacts, metadata) without
checking the content of artefacts. Content verification lives in the per-service
test files.
"""

import io

from tests.integration.conftest import (
    artefact_names,
    assert_canonize_ok,
    find_artefact,
    make_docx,
    make_pdf,
    make_pdf_with_image,
    make_png,
    make_xlsx,
    submit_and_poll,
)


class TestSubmitResponse:
    def test_202_includes_required_fields(self, test_sub):
        submit, _ = submit_and_poll(
            files={"file": ("test.txt", b"hello", "text/plain")},
            api_key=test_sub.api_key,
        )
        body = submit.json()
        assert submit.status_code == 202
        assert "job_id" in body
        assert "poll_url" in body
        assert "estimated_seconds" in body
        assert "input_bytes" in body
        assert body["input_bytes"] == 5
        assert "billable_units" in body
        assert body["status"] == "processing"


class TestTextPassthroughShape:
    def test_plain_text_produces_markdown_artefact(self, test_sub):
        _, result = submit_and_poll(
            files={"file": ("test.txt", b"hello", "text/plain")},
            api_key=test_sub.api_key,
        )
        assert result.status_code == 200
        artefacts = assert_canonize_ok(result.json())
        md = find_artefact(artefacts, "markdown")
        assert md is not None
        assert md["mime_type"] == "text/markdown"

    def test_json_produces_markdown_artefact(self, test_sub):
        _, result = submit_and_poll(
            files={"file": ("test.json", b'{"key": "value"}', "application/json")},
            api_key=test_sub.api_key,
        )
        artefacts = assert_canonize_ok(result.json())
        assert find_artefact(artefacts, "markdown") is not None


class TestPdfShape:
    def test_pdf_produces_markdown_and_pages(self, test_sub):
        pdf_bytes = make_pdf("Test content.", pages=2)
        _, result = submit_and_poll(
            files={"file": ("test.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
            api_key=test_sub.api_key,
        )
        artefacts = assert_canonize_ok(result.json())
        names = artefact_names(artefacts)
        assert "markdown" in names
        # Page thumbnails present
        assert any(n.startswith("page-") for n in names)

    def test_pdf_with_image_extracts_image_artefact(self, test_sub):
        pdf_bytes = make_pdf_with_image()
        _, result = submit_and_poll(
            files={"file": ("with-image.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
            api_key=test_sub.api_key,
        )
        artefacts = assert_canonize_ok(result.json())
        names = artefact_names(artefacts)
        assert "markdown" in names
        # Extracted images present (may or may not be, depends on Docling extraction)
        # At minimum, page thumbnails should exist
        assert any(n.startswith("page-") for n in names)

    def test_pdf_metadata_has_detected_type(self, test_sub):
        pdf_bytes = make_pdf("Metadata test.")
        _, result = submit_and_poll(
            files={"file": ("test.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
            api_key=test_sub.api_key,
        )
        data = result.json()
        assert_canonize_ok(data)
        assert data["metadata"]["detected_type"] == "application/pdf"


class TestOoxmlShape:
    def test_docx_produces_markdown_artefact(self, test_sub):
        docx_bytes = make_docx("Shape test.")
        _, result = submit_and_poll(
            files={
                "file": (
                    "test.docx",
                    io.BytesIO(docx_bytes),
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                )
            },
            api_key=test_sub.api_key,
        )
        artefacts = assert_canonize_ok(result.json())
        assert find_artefact(artefacts, "markdown") is not None

    def test_xlsx_produces_markdown_artefact(self, test_sub):
        xlsx_bytes = make_xlsx()
        _, result = submit_and_poll(
            files={
                "file": (
                    "test.xlsx",
                    io.BytesIO(xlsx_bytes),
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
            api_key=test_sub.api_key,
        )
        artefacts = assert_canonize_ok(result.json())
        assert find_artefact(artefacts, "markdown") is not None


class TestImageShape:
    def test_png_produces_image_artefact(self, test_sub):
        png_bytes = make_png("Test")
        _, result = submit_and_poll(
            files={"file": ("test.png", io.BytesIO(png_bytes), "image/png")},
            api_key=test_sub.api_key,
        )
        artefacts = assert_canonize_ok(result.json())
        img = find_artefact(artefacts, "image-1")
        assert img is not None
        assert img["mime_type"] == "image/png"
        # Images produce no markdown
        assert find_artefact(artefacts, "markdown") is None
