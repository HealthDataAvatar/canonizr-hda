"""Test that LLM-readable formats pass through without transformation."""

import io

from tests.integration.conftest import submit_and_poll


def test_plain_text(test_sub):
    submit, result = submit_and_poll(
        files={"file": ("test.txt", io.BytesIO(b"Hello, this is plain text."), "text/plain")},
        sub_id=test_sub,
    )
    assert submit.status_code == 202
    assert result.status_code == 200
    assert "Hello" in result.json()["markdown"]
    assert "passthrough" in result.json()["metadata"]["actions"]


def test_markdown(test_sub):
    submit, result = submit_and_poll(
        files={"file": ("test.md", io.BytesIO(b"# Heading\n\nA paragraph.\n"), "text/markdown")},
        sub_id=test_sub,
    )
    assert submit.status_code == 202
    assert result.status_code == 200
    assert "# Heading" in result.json()["markdown"]


def test_json(test_sub):
    submit, result = submit_and_poll(
        files={"file": ("test.json", io.BytesIO(b'{"key": "value"}'), "application/json")},
        sub_id=test_sub,
    )
    assert submit.status_code == 202
    assert result.status_code == 200
    assert "key" in result.json()["markdown"]


def test_csv(test_sub):
    submit, result = submit_and_poll(
        files={"file": ("test.csv", io.BytesIO(b"name,value\nalpha,10\n"), "text/csv")},
        sub_id=test_sub,
    )
    assert submit.status_code == 202
    assert result.status_code == 200
    assert "alpha" in result.json()["markdown"]
