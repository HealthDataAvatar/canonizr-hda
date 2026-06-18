"""Unit tests for image conversion + multi-page extraction (to_vlm_pngs)."""

from io import BytesIO

from PIL import Image

from app.imageconv import to_vlm_pngs
from app.types import ImageFile


def _img(color, fmt="PNG", mime="image/png", size=(100, 100)) -> ImageFile:
    buf = BytesIO()
    Image.new("RGB", size, color).save(buf, format=fmt)
    return ImageFile(data=buf.getvalue(), mime_type=mime)


def _multipage_tiff(colors) -> ImageFile:
    frames = [Image.new("RGB", (100, 100), c) for c in colors]
    buf = BytesIO()
    frames[0].save(buf, format="TIFF", save_all=True, append_images=frames[1:])
    return ImageFile(data=buf.getvalue(), mime_type="image/tiff")


class TestToVlmPngs:
    def test_single_frame_yields_one_png(self):
        pages = to_vlm_pngs(_img("red", "PNG", "image/png"))
        assert len(pages) == 1
        assert Image.open(BytesIO(pages[0].data)).format == "PNG"

    def test_tiff_converted_to_png(self):
        pages = to_vlm_pngs(_img("green", "TIFF", "image/tiff"))
        assert Image.open(BytesIO(pages[0].data)).format == "PNG"

    def test_bmp_converted_to_png(self):
        pages = to_vlm_pngs(_img("yellow", "BMP", "image/bmp"))
        assert Image.open(BytesIO(pages[0].data)).format == "PNG"

    def test_large_image_downscaled(self):
        pages = to_vlm_pngs(_img("red", "PNG", "image/png", size=(8000, 6000)))
        assert max(Image.open(BytesIO(pages[0].data)).size) == 2048

    def test_small_image_not_upscaled(self):
        pages = to_vlm_pngs(_img("red", "PNG", "image/png", size=(800, 600)))
        assert Image.open(BytesIO(pages[0].data)).size == (800, 600)

    def test_custom_max_dimension(self):
        pages = to_vlm_pngs(_img("red", "PNG", "image/png", size=(3000, 2000)), max_dimension=1024)
        assert max(Image.open(BytesIO(pages[0].data)).size) == 1024


class TestMultipage:
    def test_extracts_all_pages(self):
        pages = to_vlm_pngs(_multipage_tiff(["red", "green", "blue"]))
        assert len(pages) == 3
        for p in pages:
            assert Image.open(BytesIO(p.data)).format == "PNG"

    def test_single_page_tiff_yields_one(self):
        assert len(to_vlm_pngs(_multipage_tiff(["red"]))) == 1

    def test_pages_have_distinct_content(self):
        pages = to_vlm_pngs(_multipage_tiff(["red", "blue"]))
        assert pages[0].data != pages[1].data
