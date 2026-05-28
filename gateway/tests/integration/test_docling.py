"""Test Docling PDF extraction paths."""

import io

from conftest import make_pdf, submit_and_poll


def test_pdf_text():
    pdf_bytes = make_pdf("Extract this sentence from the PDF.")
    submit, result = submit_and_poll(
        files={"file": ("test.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
    )
    assert submit.status_code == 202
    assert result.status_code == 200
    data = result.json()
    assert len(data["markdown"]) > 0
    assert "docling" in data["metadata"]["actions"]


def test_pdf_multipage():
    pdf_bytes = make_pdf("Page content here.", pages=3)
    submit, result = submit_and_poll(
        files={"file": ("multipage.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
    )
    assert submit.status_code == 202
    assert result.status_code == 200
    data = result.json()
    assert len(data["markdown"]) > 0
