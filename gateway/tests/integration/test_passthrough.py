"""Test that LLM-readable formats pass through correctly."""

import io

from tests.integration.conftest import assert_canonize_ok, find_artefact, submit_and_poll


def test_plain_text(test_sub):
    _, result = submit_and_poll(
        files={"file": ("test.txt", io.BytesIO(b"Hello, this is plain text."), "text/plain")},
        sub_id=test_sub,
    )
    assert result.status_code == 200
    artefacts = assert_canonize_ok(result.json())
    md = find_artefact(artefacts, "markdown")
    assert md is not None
    assert md["size_bytes"] > 0


def test_markdown(test_sub):
    _, result = submit_and_poll(
        files={"file": ("test.md", io.BytesIO(b"# Heading\n\nA paragraph.\n"), "text/markdown")},
        sub_id=test_sub,
    )
    assert result.status_code == 200
    artefacts = assert_canonize_ok(result.json())
    assert find_artefact(artefacts, "markdown") is not None


def test_json(test_sub):
    _, result = submit_and_poll(
        files={"file": ("test.json", io.BytesIO(b'{"key": "value"}'), "application/json")},
        sub_id=test_sub,
    )
    assert result.status_code == 200
    artefacts = assert_canonize_ok(result.json())
    assert find_artefact(artefacts, "markdown") is not None


def test_csv(test_sub):
    _, result = submit_and_poll(
        files={"file": ("test.csv", io.BytesIO(b"name,value\nalpha,10\n"), "text/csv")},
        sub_id=test_sub,
    )
    assert result.status_code == 200
    artefacts = assert_canonize_ok(result.json())
    assert find_artefact(artefacts, "markdown") is not None
