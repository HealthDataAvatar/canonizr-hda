"""Split a PDF into page-range chunks using pymupdf.

Pure functions — no I/O, no globals. Used by the convert pipeline to
send manageable chunks to Docling in parallel.
"""

import fitz  # pymupdf


def page_count(pdf_bytes: bytes) -> int:
    """Return the number of pages in a PDF."""
    with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
        return doc.page_count


def split(pdf_bytes: bytes, pages_per_chunk: int) -> list[bytes]:
    """Split a PDF into chunks of at most `pages_per_chunk` pages.

    Returns a list of PDF byte strings, one per chunk.
    A PDF with fewer pages than the chunk size is returned as-is (single element).
    """
    with fitz.open(stream=pdf_bytes, filetype="pdf") as src:
        total = src.page_count
        if total <= pages_per_chunk:
            return [pdf_bytes]

        chunks = []
        for start in range(0, total, pages_per_chunk):
            end = min(start + pages_per_chunk, total) - 1  # inclusive
            with fitz.open() as dest:
                dest.insert_pdf(src, from_page=start, to_page=end)
                chunks.append(dest.tobytes())
        return chunks
