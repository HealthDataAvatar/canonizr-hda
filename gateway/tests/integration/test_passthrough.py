"""Test that LLM-readable formats pass through without transformation."""

import io

from conftest import submit_and_poll


def test_plain_text():
    content = b"Hello, this is plain text."
    submit, result = submit_and_poll(
        files={"file": ("test.txt", io.BytesIO(content), "text/plain")},
    )
    assert submit.status_code == 202
    assert result.status_code == 200
    data = result.json()
    assert "Hello" in data["markdown"]
    assert "passthrough" in data["metadata"]["actions"]


def test_markdown():
    content = b"# Heading\n\nA paragraph.\n"
    submit, result = submit_and_poll(
        files={"file": ("test.md", io.BytesIO(content), "text/markdown")},
    )
    assert submit.status_code == 202
    assert result.status_code == 200
    data = result.json()
    assert "# Heading" in data["markdown"]
    assert "passthrough" in data["metadata"]["actions"]


def test_json():
    content = b'{"key": "value", "number": 42}'
    submit, result = submit_and_poll(
        files={"file": ("test.json", io.BytesIO(content), "application/json")},
    )
    assert submit.status_code == 202
    assert result.status_code == 200
    data = result.json()
    assert "key" in data["markdown"]
    assert "passthrough" in data["metadata"]["actions"]


def test_csv():
    content = b"name,value\nalpha,10\nbeta,20\n"
    submit, result = submit_and_poll(
        files={"file": ("test.csv", io.BytesIO(content), "text/csv")},
    )
    assert submit.status_code == 202
    assert result.status_code == 200
    data = result.json()
    assert "alpha" in data["markdown"]
    assert "passthrough" in data["metadata"]["actions"]
