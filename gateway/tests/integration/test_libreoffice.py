"""Test legacy format conversion via Gotenberg (LibreOffice → PDF → Docling)."""

import io

from tests.integration.conftest import artefact_names, assert_canonize_ok, find_artefact, submit_and_poll


def test_rtf_converts_successfully(test_sub):
    """RTF is a legacy format — should go through Gotenberg → Docling."""
    rtf_content = rb"{\rtf1\ansi{\fonttbl\f0\fswiss Helvetica;}\f0\pard This is an RTF document.\par}"
    _, result = submit_and_poll(
        files={"file": ("test.rtf", io.BytesIO(rtf_content), "application/rtf")},
        sub_id=test_sub,
    )
    assert result.status_code == 200
    artefacts = assert_canonize_ok(result.json())
    names = artefact_names(artefacts)
    assert "markdown" in names
    # Legacy office produces a converted PDF artefact
    pdf = find_artefact(artefacts, "pdf")
    assert pdf is not None
    assert pdf["mime_type"] == "application/pdf"
