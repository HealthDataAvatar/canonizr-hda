"""Integration tests for AVIF/HEIF image support.

Requires pillow-heif with libheif — available in the Docker image.
Tests the full submit → poll → markdown flow.
"""

from io import BytesIO

from PIL import Image

from tests.integration.conftest import submit_and_poll

TIMEOUT = 120


def _make_avif(color="purple", size=(200, 200)) -> bytes:
    img = Image.new("RGB", size, color)
    buf = BytesIO()
    img.save(buf, format="AVIF")
    return buf.getvalue()


def _make_heif(color="orange", size=(200, 200)) -> bytes:
    img = Image.new("RGB", size, color)
    buf = BytesIO()
    img.save(buf, format="HEIF")
    return buf.getvalue()


class TestAvifSupport:
    def test_avif_returns_markdown(self, test_sub):
        avif_bytes = _make_avif()
        files = {"file": ("test.avif", avif_bytes, "image/avif")}
        _, result = submit_and_poll(files, test_sub)
        assert result.status_code == 200
        body = result.json()
        assert "markdown" in body
        assert len(body["markdown"]) > 0

    def test_heif_returns_markdown(self, test_sub):
        heif_bytes = _make_heif()
        files = {"file": ("test.heic", heif_bytes, "image/heif")}
        _, result = submit_and_poll(files, test_sub)
        assert result.status_code == 200
        body = result.json()
        assert "markdown" in body
        assert len(body["markdown"]) > 0
