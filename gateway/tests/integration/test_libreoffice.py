"""Test legacy format conversion via Gotenberg (LibreOffice → PDF → Docling)."""

import io

from tests.integration.conftest import submit_and_poll


def test_rtf_converts_to_markdown(test_sub):
    """RTF is a legacy format — should go through Gotenberg → Docling."""
    rtf_content = rb"{\rtf1\ansi{\fonttbl\f0\fswiss Helvetica;}\f0\pard This is an RTF document.\par}"
    submit, result = submit_and_poll(
        files={"file": ("test.rtf", io.BytesIO(rtf_content), "application/rtf")},
        sub_id=test_sub,
    )
    assert submit.status_code == 202
    assert result.status_code == 200
    data = result.json()
    assert "RTF document" in data["markdown"]
    assert any("gotenberg" in a for a in data["metadata"]["actions"])
    assert "docling" in data["metadata"]["actions"]
