"""Image post-processing: classify, caption, or label images extracted from documents.

Works with typed ExtractedImage and ImageCaptioner — no untyped dicts.
"""

import asyncio
import base64
import logging
import os
import re
import time
from dataclasses import dataclass
from enum import StrEnum
from io import BytesIO

from PIL import Image

from ..imageconv import to_vlm_png
from ..protocols import ImageCaptioner
from ..tracing import Span
from ..types import ExtractedImage, ImageFile, Markdown

logger = logging.getLogger(__name__)

MIN_IMAGE_DIMENSION = 50
CAPTIONING_CONCURRENCY = int(os.environ.get("CAPTIONING_CONCURRENCY", "4"))

IMAGE_RE = re.compile(r"!\[([^\]]*)\]\(data:(image/[^;]+);base64,([^)]+)\)")


class PictureClassification(StrEnum):
    """Docling picture classification labels."""

    PIE_CHART = "pie_chart"
    BAR_CHART = "bar_chart"
    STACKED_BAR_CHART = "stacked_bar_chart"
    LINE_CHART = "line_chart"
    SCATTER_CHART = "scatter_chart"
    HEATMAP = "heatmap"
    STRATIGRAPHIC_CHART = "stratigraphic_chart"
    FLOW_CHART = "flow_chart"
    ELECTRICAL_DIAGRAM = "electrical_diagram"
    CAD_DRAWING = "cad_drawing"
    NATURAL_IMAGE = "natural_image"
    SCREENSHOT = "screenshot"
    MAP = "map"
    REMOTE_SENSING = "remote_sensing"
    PICTURE_GROUP = "picture_group"
    CHEMISTRY_MOLECULAR = "chemistry_molecular_structure"
    CHEMISTRY_MARKUSH = "chemistry_markush_structure"
    LOGO = "logo"
    ICON = "icon"
    SIGNATURE = "signature"
    STAMP = "stamp"
    QR_CODE = "qr_code"
    BAR_CODE = "bar_code"
    OTHER = "other"


SKIP_LABELS = {
    PictureClassification.LOGO,
    PictureClassification.ICON,
    PictureClassification.SIGNATURE,
    PictureClassification.STAMP,
    PictureClassification.QR_CODE,
    PictureClassification.BAR_CODE,
}

SKIP_LABEL_VALUES = {label.value for label in SKIP_LABELS}


class CaptioningUpstreamError(Exception):
    """Raised when the captioning service fails for an image."""

    def __init__(self, index: int, cause: Exception):
        self.index = index
        self.cause = cause
        super().__init__(f"Captioning failed for image at index {index}: {cause}")


class ImageOutcome(StrEnum):
    """Outcome of processing a single image in the pipeline."""

    CAPTIONED = "captioned"
    SKIPPED_DECORATIVE = "skipped_decorative"
    SKIPPED_TOO_SMALL = "skipped_too_small"
    ERRORED_DECODE = "errored_decode"
    LABELLED = "labelled"
    NEEDS_CAPTION = "needs_caption"


# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------


def _should_skip(image: ExtractedImage) -> bool:
    """Whether an image is decorative and should be skipped."""
    return bool(image.classifications & SKIP_LABEL_VALUES)


def _image_dimensions(image_b64: str) -> tuple[int, int]:
    """Decode a base64 image and return (width, height)."""
    img = Image.open(BytesIO(base64.b64decode(image_b64)))
    return img.size


@dataclass
class _ClassifiedEntry:
    """A single image in the markdown, classified for processing."""

    index: int
    match: re.Match
    mime_type: str
    image_b64: str
    outcome: ImageOutcome
    replacement: str | None = None
    dimensions: tuple[int, int] | None = None


def _classify_images(md_content: str, images: list[ExtractedImage]) -> list[_ClassifiedEntry]:
    """Classify each embedded base64 image in the markdown."""
    matches = list(IMAGE_RE.finditer(md_content))
    entries = []

    for index, match in enumerate(matches):
        mime_type = match.group(2)
        image_b64 = match.group(3)

        image = images[index] if index < len(images) else None

        if image and _should_skip(image):
            entries.append(
                _ClassifiedEntry(
                    index=index,
                    match=match,
                    mime_type=mime_type,
                    image_b64=image_b64,
                    outcome=ImageOutcome.SKIPPED_DECORATIVE,
                    replacement=f"![{image.label}]",
                )
            )
        else:
            try:
                width, height = _image_dimensions(image_b64)
            except Exception:
                logger.warning("Could not decode image at index %d", index)
                entries.append(
                    _ClassifiedEntry(
                        index=index,
                        match=match,
                        mime_type=mime_type,
                        image_b64=image_b64,
                        outcome=ImageOutcome.ERRORED_DECODE,
                        replacement="![Image corrupted]",
                    )
                )
            else:
                if width < MIN_IMAGE_DIMENSION or height < MIN_IMAGE_DIMENSION:
                    entries.append(
                        _ClassifiedEntry(
                            index=index,
                            match=match,
                            mime_type=mime_type,
                            image_b64=image_b64,
                            outcome=ImageOutcome.SKIPPED_TOO_SMALL,
                            dimensions=(width, height),
                        )
                    )
                else:
                    entries.append(
                        _ClassifiedEntry(
                            index=index,
                            match=match,
                            mime_type=mime_type,
                            image_b64=image_b64,
                            outcome=ImageOutcome.NEEDS_CAPTION,
                            dimensions=(width, height),
                        )
                    )

    return entries


def _apply_replacements(md_content: str, entries: list[_ClassifiedEntry]) -> tuple[str, dict[ImageOutcome, int]]:
    """Apply replacements in reverse order. Returns (result_markdown, counts)."""
    counts: dict[ImageOutcome, int] = {o: 0 for o in ImageOutcome}
    result = md_content

    for entry in reversed(entries):
        if entry.replacement is None:
            result = result[: entry.match.start()] + result[entry.match.end() :]
        else:
            result = result[: entry.match.start()] + entry.replacement + result[entry.match.end() :]
        counts[entry.outcome] += 1

    return result, counts


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def caption_images(
    md_content: Markdown,
    images: list[ExtractedImage],
    deadline: float,
    parent: Span,
    captioner: ImageCaptioner,
) -> Markdown:
    """Replace base64 images in markdown with captions. Raises CaptioningUpstreamError on failure."""
    entries = _classify_images(md_content, images)
    if not entries:
        return md_content

    cap_span = Span(name="captioning", attributes={"image_count": len(entries)})
    cap_span._start = time.monotonic()
    parent.children.append(cap_span)

    semaphore = asyncio.Semaphore(CAPTIONING_CONCURRENCY)
    tasks: list[tuple[int, asyncio.Task]] = []
    image_spans: dict[int, Span] = {}

    async def _caption_one(index: int, image_b64: str, mime_type: str) -> Markdown:
        img_span = Span(
            name=f"caption_image[{index}]",
            attributes={"base64_bytes_original": len(image_b64)},
        )
        img_span._start = time.monotonic()
        cap_span.children.append(img_span)
        image_spans[index] = img_span

        raw = base64.b64decode(image_b64)
        vlm_png = to_vlm_png(ImageFile(data=raw, mime_type=mime_type))
        img_span.set(output_size_bytes=len(vlm_png.data))

        async with semaphore:
            return await captioner.caption(vlm_png, deadline, img_span)

    for entry in entries:
        if entry.outcome == ImageOutcome.NEEDS_CAPTION:
            task = asyncio.create_task(_caption_one(entry.index, entry.image_b64, entry.mime_type))
            tasks.append((entry.index, task))

    for index, task in tasks:
        entry = entries[index]
        try:
            caption_text = await task
            entry.replacement = f"![{caption_text}]"
            entry.outcome = ImageOutcome.CAPTIONED
            image_spans[index]._end = time.monotonic()
        except Exception as e:
            image_spans[index]._end = time.monotonic()
            image_spans[index].set(error=str(e))
            for _, remaining in tasks:
                remaining.cancel()
            cap_span._end = time.monotonic()
            raise CaptioningUpstreamError(index, e) from e

    result, counts = _apply_replacements(md_content, entries)

    cap_span._end = time.monotonic()
    cap_span.set(
        images_captioned=counts[ImageOutcome.CAPTIONED],
        skipped=counts[ImageOutcome.SKIPPED_DECORATIVE] + counts[ImageOutcome.SKIPPED_TOO_SMALL],
        errored=counts[ImageOutcome.ERRORED_DECODE],
    )

    return Markdown(result)


def label_images(md_content: Markdown, images: list[ExtractedImage]) -> Markdown:
    """Label images with classifications, preserving base64 for content images."""
    entries = _classify_images(md_content, images)
    if not entries:
        return md_content

    for entry in entries:
        if entry.outcome == ImageOutcome.NEEDS_CAPTION:
            image = images[entry.index] if entry.index < len(images) else None
            label = image.label if image else "Image"
            entry.replacement = f"![{label}](data:{entry.mime_type};base64,{entry.image_b64})"
            entry.outcome = ImageOutcome.LABELLED

    result, _ = _apply_replacements(md_content, entries)
    return Markdown(result)
