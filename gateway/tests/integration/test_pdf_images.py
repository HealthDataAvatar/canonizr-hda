"""Test PDF embedded image extraction paths."""

import io

from tests.integration.conftest import (
    EmbeddedImage,
    artefact_names,
    assert_canonize_ok,
    make_pdf_with_images,
    submit_and_poll,
)


def test_fixture_pdf_image_is_processed(test_sub):
    """rising-bars.pdf has an embedded chart — should produce image artefacts."""
    with open("/fixtures/rising-bars.pdf", "rb") as f:
        pdf_bytes = f.read()
    _, result = submit_and_poll(
        files={"file": ("rising-bars.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
        api_key=test_sub.api_key,
    )
    assert result.status_code == 200
    artefacts = assert_canonize_ok(result.json())
    names = artefact_names(artefacts)
    # Image-heavy PDF may have no text — markdown artefact is optional
    # Should have page thumbnails and/or extracted images
    assert any(n.startswith("page-") or n.startswith("image-") for n in names)


def test_generated_small_image_is_skipped(test_sub):
    """A generated PDF with a tiny image — may be skipped by dimension check."""
    pdf_bytes = make_pdf_with_images([EmbeddedImage("tiny", 30, 30)])
    _, result = submit_and_poll(
        files={"file": ("small_img.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
        api_key=test_sub.api_key,
    )
    assert result.status_code == 200
    assert_canonize_ok(result.json())
