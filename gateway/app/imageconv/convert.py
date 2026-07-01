from io import BytesIO

import pillow_heif
from PIL import Image, UnidentifiedImageError

from ..errors import MalformedInput
from ..types import ImageFile, VlmImagePNG

pillow_heif.register_heif_opener()
pillow_heif.register_avif_opener()

# Explicit decompression-bomb cap, tighter than Pillow's ~178M default. At 3
# bytes/px (RGB) a 50M-px image is ~150MB decoded — bounded under worker
# concurrency. Pillow raises DecompressionBombError past this during decode.
Image.MAX_IMAGE_PIXELS = 50_000_000

DEFAULT_MAX_DIMENSION = 2048


def _downscale(img: Image.Image, max_dimension: int) -> Image.Image:
    """Downscale to fit within max_dimension, preserving aspect ratio."""
    if max(img.size) > max_dimension:
        img.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)
    return img


def to_vlm_pngs(image: ImageFile, *, max_dimension: int = DEFAULT_MAX_DIMENSION) -> list[VlmImagePNG]:
    """Convert an image to VLM-ready PNGs — one per frame.

    Single-frame images yield one PNG; multi-page formats (e.g. TIFF) yield one
    PNG per page so no page is silently dropped. Each frame is downscaled to fit
    within max_dimension.
    """
    # Untrusted bytes: a corrupt image or a decompression bomb is the user's bad
    # input, not our fault — surface it as MalformedInput (400/permanent), never a
    # 500. The decode happens lazily in .convert() below, so the pixel-cap guard
    # (DecompressionBombError) and format errors can fire there too — hence the
    # try spans the whole loop.
    try:
        img = Image.open(BytesIO(image.data))
        pages: list[VlmImagePNG] = []
        for i in range(getattr(img, "n_frames", 1)):
            img.seek(i)
            frame = _downscale(img.convert("RGB"), max_dimension)
            buf = BytesIO()
            frame.save(buf, format="PNG")
            pages.append(VlmImagePNG(data=buf.getvalue()))
        return pages
    except (Image.DecompressionBombError, UnidentifiedImageError, OSError) as e:
        raise MalformedInput(f"Could not decode image: {e}") from e
