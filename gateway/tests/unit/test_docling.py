"""Unit tests for image post-processing: outcome enum, skip classification."""

from app.services.image_postprocess import ImageOutcome, _should_skip
from app.types import ExtractedImage


def test_image_outcome_values():
    assert ImageOutcome.CAPTIONED.value == "captioned"
    assert ImageOutcome.SKIPPED_DECORATIVE.value == "skipped_decorative"
    assert ImageOutcome.SKIPPED_TOO_SMALL.value == "skipped_too_small"
    assert ImageOutcome.ERRORED_DECODE.value == "errored_decode"
    assert ImageOutcome.LABELLED.value == "labelled"


def _img(labels: set[str]) -> ExtractedImage:
    return ExtractedImage(data=b"", mime_type="image/png", label="Test", classifications=frozenset(labels))


def test_should_skip_decorative():
    assert _should_skip(_img({"logo"})) is True
    assert _should_skip(_img({"qr_code"})) is True


def test_should_not_skip_content():
    assert _should_skip(_img({"bar_chart"})) is False
    assert _should_skip(_img({"natural_image"})) is False


def test_should_not_skip_empty():
    assert _should_skip(_img(set())) is False
