"""Test Docling PDF extraction paths."""

import io

from tests.integration.conftest import make_pdf, submit_and_poll


def test_pdf_text(test_sub):
    pdf_bytes = make_pdf("Extract this sentence from the PDF.")
    submit, result = submit_and_poll(
        files={"file": ("test.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
        sub_id=test_sub,
    )
    assert submit.status_code == 202
    assert result.status_code == 200
    data = result.json()
    assert len(data["markdown"]) > 0
    assert "docling" in data["metadata"]["actions"]


def test_pdf_multipage(test_sub):
    pdf_bytes = make_pdf("Page content here.", pages=3)
    submit, result = submit_and_poll(
        files={"file": ("multipage.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
        sub_id=test_sub,
    )
    assert submit.status_code == 202
    assert result.status_code == 200
    assert len(result.json()["markdown"]) > 0


def test_pdf_chunked_large(test_sub):
    """A PDF exceeding DOCLING_CHUNK_PAGES (default 10) is split and processed in chunks."""
    pdf_bytes = make_pdf("Chunk test content on this page.", pages=15)
    submit, result = submit_and_poll(
        files={"file": ("large.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
        sub_id=test_sub,
        timeout=300,
    )
    assert submit.status_code == 202
    assert result.status_code == 200
    data = result.json()
    assert len(data["markdown"]) > 0
    assert "docling" in data["metadata"]["actions"]
