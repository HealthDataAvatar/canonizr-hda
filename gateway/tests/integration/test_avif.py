"""Integration tests for AVIF/HEIF image support.

Requires pillow-heif with libheif — available in the Docker image.
Images are normalised to PNG artefacts.
"""

from io import BytesIO

import pillow_heif
from PIL import Image

pillow_heif.register_heif_opener()
pillow_heif.register_avif_opener()

import pytest

from tests.integration.conftest import assert_canonize_ok, find_artefact, submit_and_poll

pytestmark = pytest.mark.smoke


def _make_avif(color="purple", size=(200, 200)) -> bytes:
    img = Image.new("RGB", size, color)
    buf = BytesIO()
    img.save(buf, format="AVIF")
    return buf.getvalue()


def _make_heif(color="orange", size=(200, 200)) -> bytes:
    heif_file = pillow_heif.from_pillow(Image.new("RGB", size, color))
    buf = BytesIO()
    heif_file.save(buf)
    return buf.getvalue()


class TestAvifSupport:
    def test_avif_produces_png_artefact(self, test_sub):
        avif_bytes = _make_avif()
        _, result = submit_and_poll({"file": ("test.avif", avif_bytes, "image/avif")}, test_sub.api_key)
        assert result.status_code == 200
        artefacts = assert_canonize_ok(result.json())
        img = find_artefact(artefacts, "image-0")
        assert img is not None
        assert img["mime_type"] == "image/png"

    def test_heif_produces_png_artefact(self, test_sub):
        heif_bytes = _make_heif()
        _, result = submit_and_poll({"file": ("test.heic", heif_bytes, "image/heif")}, test_sub.api_key)
        assert result.status_code == 200
        artefacts = assert_canonize_ok(result.json())
        img = find_artefact(artefacts, "image-0")
        assert img is not None
        assert img["mime_type"] == "image/png"
