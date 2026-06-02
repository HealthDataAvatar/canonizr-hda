"""Unit tests for image conversion and multi-page extraction."""

from io import BytesIO

from PIL import Image

from app.imageconv import extract_pages, is_multipage, prepare_image_for_vlm


def _make_image(color, fmt="PNG", mime="image/png", size=(100, 100)):
    """Create a single solid-color image."""
    img = Image.new("RGB", size, color)
    buf = BytesIO()
    img.save(buf, format=fmt)
    return buf.getvalue(), mime


def _make_multipage_tiff(colors):
    """Create a multi-page TIFF from a list of colors."""
    frames = [Image.new("RGB", (100, 100), c) for c in colors]
    buf = BytesIO()
    frames[0].save(buf, format="TIFF", save_all=True, append_images=frames[1:])
    return buf.getvalue()


class TestToNative:
    def test_png_passthrough(self):
        data, _ = _make_image("red", "PNG", "image/png")
        out, out_mime = prepare_image_for_vlm(data, "image/png")
        assert out is data
        assert out_mime == "image/png"

    def test_jpeg_passthrough(self):
        data, _ = _make_image("blue", "JPEG", "image/jpeg")
        out, out_mime = prepare_image_for_vlm(data, "image/jpeg")
        assert out is data
        assert out_mime == "image/jpeg"

    def test_tiff_converted_to_png(self):
        data, _ = _make_image("green", "TIFF", "image/tiff")
        out, out_mime = prepare_image_for_vlm(data, "image/tiff")
        assert out_mime == "image/png"
        assert out != data
        img = Image.open(BytesIO(out))
        assert img.format == "PNG"

    def test_bmp_converted_to_png(self):
        data, _ = _make_image("yellow", "BMP", "image/bmp")
        _, out_mime = prepare_image_for_vlm(data, "image/bmp")
        assert out_mime == "image/png"

    def test_large_png_downscaled(self):
        data, _ = _make_image("red", "PNG", "image/png", size=(8000, 6000))
        out, out_mime = prepare_image_for_vlm(data, "image/png")
        assert out_mime == "image/png"
        assert out is not data
        img = Image.open(BytesIO(out))
        assert max(img.size) == 2048

    def test_small_png_not_downscaled(self):
        data, _ = _make_image("red", "PNG", "image/png", size=(2000, 1000))
        out, out_mime = prepare_image_for_vlm(data, "image/png")
        assert out is data

    def test_large_tiff_downscaled(self):
        data, _ = _make_image("blue", "TIFF", "image/tiff", size=(6000, 8000))
        out, out_mime = prepare_image_for_vlm(data, "image/tiff")
        assert out_mime == "image/png"
        img = Image.open(BytesIO(out))
        assert max(img.size) == 2048
        assert img.size[1] == 2048  # height was the long side

    def test_custom_max_dimension(self):
        data, _ = _make_image("red", "PNG", "image/png", size=(3000, 2000))
        out, out_mime = prepare_image_for_vlm(data, "image/png", max_dimension=1024)
        img = Image.open(BytesIO(out))
        assert max(img.size) == 1024

    def test_custom_max_dimension_passthrough(self):
        data, _ = _make_image("red", "PNG", "image/png", size=(800, 600))
        out, out_mime = prepare_image_for_vlm(data, "image/png", max_dimension=1024)
        assert out is data


class TestIsMultipage:
    def test_tiff_is_multipage(self):
        assert is_multipage("image/tiff") is True

    def test_png_is_not_multipage(self):
        assert is_multipage("image/png") is False

    def test_jpeg_is_not_multipage(self):
        assert is_multipage("image/jpeg") is False


class TestExtractPages:
    def test_extracts_all_pages(self):
        tiff_bytes = _make_multipage_tiff(["red", "green", "blue"])
        pages = extract_pages(tiff_bytes)
        assert len(pages) == 3
        for page_bytes, mime in pages:
            assert mime == "image/png"
            img = Image.open(BytesIO(page_bytes))
            assert img.format == "PNG"

    def test_single_page_tiff(self):
        tiff_bytes = _make_multipage_tiff(["red"])
        pages = extract_pages(tiff_bytes)
        assert len(pages) == 1

    def test_pages_have_distinct_content(self):
        tiff_bytes = _make_multipage_tiff(["red", "blue"])
        pages = extract_pages(tiff_bytes)
        assert pages[0][0] != pages[1][0]
