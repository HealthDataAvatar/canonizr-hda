"""Test image canonization paths.

Images are normalised to PNG — no captioning in the canonize pipeline.
Captioning moves to the /describe endpoint (future).

These are smoke tests — marked to run separately.
"""

import io

import pytest

from tests.integration.conftest import assert_canonize_ok, find_artefact, make_png, submit_and_poll

pytestmark = pytest.mark.smoke


def test_image_produces_png_artefact(test_sub):
    png_bytes = make_png("Hello World")
    _, result = submit_and_poll(
        files={"file": ("test.png", io.BytesIO(png_bytes), "image/png")},
        sub_id=test_sub,
    )
    assert result.status_code == 200
    artefacts = assert_canonize_ok(result.json())
    img = find_artefact(artefacts, "image-0")
    assert img is not None
    assert img["mime_type"] == "image/png"
    # No markdown for image-only jobs
    assert find_artefact(artefacts, "markdown") is None
