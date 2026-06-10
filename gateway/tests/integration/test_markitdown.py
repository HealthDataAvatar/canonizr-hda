"""Test MarkItDown conversion paths (DOCX, XLSX)."""

import io

from tests.integration.conftest import assert_canonize_ok, find_artefact, make_docx, make_xlsx, submit_and_poll


def test_docx(test_sub):
    docx_bytes = make_docx("Integration test paragraph.")
    _, result = submit_and_poll(
        files={
            "file": (
                "test.docx",
                io.BytesIO(docx_bytes),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
        api_key=test_sub.api_key,
    )
    assert result.status_code == 200
    artefacts = assert_canonize_ok(result.json())
    assert find_artefact(artefacts, "markdown") is not None


def test_xlsx(test_sub):
    xlsx_bytes = make_xlsx()
    _, result = submit_and_poll(
        files={
            "file": (
                "test.xlsx",
                io.BytesIO(xlsx_bytes),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
        api_key=test_sub.api_key,
    )
    assert result.status_code == 200
    artefacts = assert_canonize_ok(result.json())
    assert find_artefact(artefacts, "markdown") is not None
