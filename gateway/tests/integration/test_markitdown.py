"""Test MarkItDown conversion paths (DOCX, XLSX)."""

import io

from tests.integration.conftest import make_docx, make_xlsx, submit_and_poll


def test_docx(test_sub):
    docx_bytes = make_docx("Integration test paragraph.")
    submit, result = submit_and_poll(
        files={
            "file": (
                "test.docx",
                io.BytesIO(docx_bytes),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
        sub_id=test_sub,
    )
    assert submit.status_code == 202
    assert result.status_code == 200
    data = result.json()
    assert "Integration test paragraph" in data["markdown"]
    assert "markitdown" in data["metadata"]["actions"]


def test_xlsx(test_sub):
    xlsx_bytes = make_xlsx()
    submit, result = submit_and_poll(
        files={
            "file": (
                "test.xlsx",
                io.BytesIO(xlsx_bytes),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
        sub_id=test_sub,
    )
    assert submit.status_code == 202
    assert result.status_code == 200
    data = result.json()
    assert "Alpha" in data["markdown"]
    assert "markitdown" in data["metadata"]["actions"]
