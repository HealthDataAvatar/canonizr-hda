"""Test captioning service paths.

These are smoke tests — they require a live captioning service.
They should NOT run in the standard integration test suite.
"""

import io

import pytest

from tests.integration.conftest import make_png, make_tiff, submit_and_poll

pytestmark = pytest.mark.smoke


def test_image_returns_text(test_sub):
    png_bytes = make_png("Hello World")
    submit, result = submit_and_poll(
        files={"file": ("test.png", io.BytesIO(png_bytes), "image/png")},
        sub_id=test_sub,
    )
    assert submit.status_code == 202
    assert result.status_code == 200
    assert len(result.json()["markdown"]) > 0


def test_image_caption_not_empty(test_sub):
    png_bytes = make_png("Test 123")
    submit, result = submit_and_poll(
        files={"file": ("test.png", io.BytesIO(png_bytes), "image/png")},
        sub_id=test_sub,
    )
    assert submit.status_code == 202
    assert result.status_code == 200
    assert len(result.json()["markdown"].strip()) > 5


def test_multipage_tiff(test_sub):
    tiff_bytes = make_tiff(["Page One", "Page Two", "Page Three"])
    submit, result = submit_and_poll(
        files={"file": ("scan.tiff", io.BytesIO(tiff_bytes), "image/tiff")},
        sub_id=test_sub,
    )
    assert submit.status_code == 202
    assert result.status_code == 200
    assert result.json()["metadata"]["captioning"]["images_captioned"] == 3
