"""Unit tests for PDF splitting — uses pymupdf to create test PDFs."""

import fitz

from app.pdfsplit import page_count, split


def _make_pdf(pages: int) -> bytes:
    """Create a simple PDF with N pages, each containing its page number."""
    doc = fitz.open()
    for i in range(pages):
        page = doc.new_page()
        page.insert_text((72, 72), f"Page {i + 1}")
    data = doc.tobytes()
    doc.close()
    return data


class TestPageCount:
    def test_single_page(self):
        assert page_count(_make_pdf(1)) == 1

    def test_multiple_pages(self):
        assert page_count(_make_pdf(25)) == 25


class TestSplit:
    def test_small_pdf_returns_original(self):
        pdf = _make_pdf(5)
        chunks = split(pdf, pages_per_chunk=10)
        assert len(chunks) == 1
        assert chunks[0] is pdf

    def test_exact_chunk_boundary(self):
        pdf = _make_pdf(20)
        chunks = split(pdf, pages_per_chunk=10)
        assert len(chunks) == 2
        assert page_count(chunks[0]) == 10
        assert page_count(chunks[1]) == 10

    def test_uneven_split(self):
        pdf = _make_pdf(25)
        chunks = split(pdf, pages_per_chunk=10)
        assert len(chunks) == 3
        assert page_count(chunks[0]) == 10
        assert page_count(chunks[1]) == 10
        assert page_count(chunks[2]) == 5

    def test_single_page_chunks(self):
        pdf = _make_pdf(3)
        chunks = split(pdf, pages_per_chunk=1)
        assert len(chunks) == 3
        for chunk in chunks:
            assert page_count(chunk) == 1

    def test_chunk_size_equals_total(self):
        pdf = _make_pdf(10)
        chunks = split(pdf, pages_per_chunk=10)
        assert len(chunks) == 1
        assert chunks[0] is pdf

    def test_chunk_size_exceeds_total(self):
        pdf = _make_pdf(3)
        chunks = split(pdf, pages_per_chunk=100)
        assert len(chunks) == 1
        assert chunks[0] is pdf

    def test_all_pages_preserved(self):
        """Total page count across all chunks equals the original."""
        pdf = _make_pdf(47)
        chunks = split(pdf, pages_per_chunk=10)
        total = sum(page_count(c) for c in chunks)
        assert total == 47

    def test_page_content_preserved(self):
        """Text content survives the split."""
        pdf = _make_pdf(3)
        chunks = split(pdf, pages_per_chunk=1)
        for i, chunk in enumerate(chunks):
            doc = fitz.open(stream=chunk, filetype="pdf")
            text = doc[0].get_text()
            doc.close()
            assert f"Page {i + 1}" in text

    def test_large_pdf(self):
        """Handles a 200-page PDF without error."""
        pdf = _make_pdf(200)
        chunks = split(pdf, pages_per_chunk=10)
        assert len(chunks) == 20
        assert all(page_count(c) == 10 for c in chunks)
