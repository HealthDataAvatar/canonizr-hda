from io import BytesIO

import pillow_heif
from PIL import Image

pillow_heif.register_heif_opener()
pillow_heif.register_avif_opener()

# MIME types the captioning VLM accepts natively — no conversion needed
NATIVE_TYPES = {
    "image/jpeg",
    "image/png",
}

MULTIPAGE_TYPES = {"image/tiff"}

DEFAULT_MAX_DIMENSION = 2048


def _downscale(img: Image.Image, max_dimension: int) -> Image.Image:
    """Downscale to fit within max_dimension, preserving aspect ratio."""
    if max(img.size) > max_dimension:
        img.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)
    return img


def prepare_image_for_vlm(
    image_bytes: bytes, mime_type: str, *, max_dimension: int = DEFAULT_MAX_DIMENSION
) -> tuple[bytes, str]:
    """Convert image bytes to PNG if the format isn't natively supported by the VLM.
    Downscales if either dimension exceeds max_dimension.
    Returns (converted_bytes, mime_type)."""
    img = Image.open(BytesIO(image_bytes))

    if mime_type in NATIVE_TYPES and max(img.size) <= max_dimension:
        return image_bytes, mime_type

    _downscale(img, max_dimension)
    buf = BytesIO()
    img.convert("RGB").save(buf, format="PNG")
    return buf.getvalue(), "image/png"


def extract_pages(image_bytes: bytes, *, max_dimension: int = DEFAULT_MAX_DIMENSION) -> list[tuple[bytes, str]]:
    """Extract all pages from a multi-page image (e.g. TIFF) as PNG.
    Downscales pages that exceed max_dimension.
    Returns a list of (image_bytes, mime_type) tuples."""
    img = Image.open(BytesIO(image_bytes))
    pages = []
    for i in range(getattr(img, "n_frames", 1)):
        img.seek(i)
        frame = img.convert("RGB")
        _downscale(frame, max_dimension)
        buf = BytesIO()
        frame.save(buf, format="PNG")
        pages.append((buf.getvalue(), "image/png"))
    return pages


def is_multipage(mime_type: str) -> bool:
    return mime_type in MULTIPAGE_TYPES


# ---------------------------------------------------------------------------
# Typed wrappers using domain types
# ---------------------------------------------------------------------------

from ..types import ImageFile, VlmImagePNG


def to_vlm_png(image: ImageFile, *, max_dimension: int = DEFAULT_MAX_DIMENSION) -> VlmImagePNG:
    """Convert any image format to a VLM-ready PNG, downscaled."""
    img = Image.open(BytesIO(image.data))
    _downscale(img, max_dimension)
    buf = BytesIO()
    img.convert("RGB").save(buf, format="PNG")
    return VlmImagePNG(data=buf.getvalue())


def extract_pages_typed(image: ImageFile, *, max_dimension: int = DEFAULT_MAX_DIMENSION) -> list[VlmImagePNG]:
    """Extract all pages from a multi-page image (e.g. TIFF) as VLM-ready PNGs."""
    img = Image.open(BytesIO(image.data))
    pages = []
    for i in range(getattr(img, "n_frames", 1)):
        img.seek(i)
        frame = img.convert("RGB")
        _downscale(frame, max_dimension)
        buf = BytesIO()
        frame.save(buf, format="PNG")
        pages.append(VlmImagePNG(data=buf.getvalue()))
    return pages
