"""Test Docling PDF extraction paths."""

import io

from tests.integration.conftest import artefact_names, assert_canonize_ok, find_artefact, make_pdf, submit_and_poll


def test_pdf_text(test_sub):
    pdf_bytes = make_pdf("Extract this sentence from the PDF.")
    _, result = submit_and_poll(
        files={"file": ("test.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
        api_key=test_sub.api_key,
    )
    assert result.status_code == 200
    artefacts = assert_canonize_ok(result.json())
    assert find_artefact(artefacts, "markdown") is not None
    assert result.json()["metadata"]["detected_type"] == "application/pdf"


def test_pdf_multipage(test_sub):
    pdf_bytes = make_pdf("Page content here.", pages=3)
    _, result = submit_and_poll(
        files={"file": ("multipage.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
        api_key=test_sub.api_key,
    )
    assert result.status_code == 200
    artefacts = assert_canonize_ok(result.json())
    assert find_artefact(artefacts, "markdown") is not None
    # Multi-page PDF should produce page thumbnails
    pages = [n for n in artefact_names(artefacts) if n.startswith("page-")]
    assert len(pages) >= 1
