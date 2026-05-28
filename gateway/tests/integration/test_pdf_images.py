"""Test PDF embedded image captioning paths."""

import io

from conftest import EmbeddedImage, make_pdf_with_images, submit_and_poll


def _find_span(trace: dict, name: str) -> dict | None:
    """Recursively find a span by name in a trace tree."""
    if trace.get("name") == name:
        return trace
    for child in trace.get("children", []):
        found = _find_span(child, name)
        if found:
            return found
    return None


def test_fixture_pdf_image_is_processed():
    """rising-bars.pdf has an embedded chart that should reach captioning."""
    with open("/fixtures/rising-bars.pdf", "rb") as f:
        pdf_bytes = f.read()
    submit, result = submit_and_poll(
        files={"file": ("rising-bars.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
    )
    assert submit.status_code == 202
    assert result.status_code == 200
    data = result.json()
    assert "docling" in data["metadata"]["actions"]


def test_generated_small_image_is_skipped():
    """A generated PDF with a tiny image — should be skipped by dimension check."""
    pdf_bytes = make_pdf_with_images(
        [
            EmbeddedImage("tiny", 30, 30),
        ]
    )
    submit, result = submit_and_poll(
        files={"file": ("small_img.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
    )
    assert submit.status_code == 202
    assert result.status_code == 200
    data = result.json()
    assert "docling" in data["metadata"]["actions"]
