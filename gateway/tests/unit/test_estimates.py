"""Unit tests for processing time estimates."""

from app.estimates import estimate_seconds


class TestEstimates:
    def test_passthrough_fast(self):
        assert estimate_seconds("text/plain", 1000) <= 2

    def test_markitdown(self):
        assert estimate_seconds("text/html", 5000) <= 5

    def test_pdf_scales_with_size(self):
        small = estimate_seconds("application/pdf", 100_000)
        large = estimate_seconds("application/pdf", 5_000_000)
        assert large > small

    def test_pdf_minimum(self):
        assert estimate_seconds("application/pdf", 1) >= 3

    def test_image(self):
        assert estimate_seconds("image/png", 50_000) >= 5

    def test_libreoffice_slow(self):
        assert estimate_seconds("application/msword", 100_000) >= 30

    def test_unknown_type_conservative(self):
        assert estimate_seconds("application/octet-stream", 1000) >= 5
