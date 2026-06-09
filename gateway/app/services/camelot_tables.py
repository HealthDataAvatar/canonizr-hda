"""Table extraction using Camelot.

Implements the TableExtractor protocol.
"""

import asyncio
import functools
import os
import tempfile

from ..tracing import Span
from ..types import ExtractedTable, ExtractedTables, PdfContent


def _extract_tables_sync(pdf_bytes: bytes) -> list[ExtractedTable]:
    import camelot

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
        f.write(pdf_bytes)
        tmp_path = f.name
    try:
        tables = camelot.read_pdf(tmp_path, pages="all", flavor="lattice")  # type: ignore[attr-defined]
        result: list[ExtractedTable] = []
        for t in tables:
            df = t.df
            if df.empty:
                continue

            # First row is typically headers
            headers = [str(c) for c in df.iloc[0]]
            rows = [[str(c) for c in row] for _, row in df.iloc[1:].iterrows()]
            accuracy = t.parsing_report.get("accuracy", 0.0) / 100
            page_num = (t.page or 1) - 1  # Camelot is 1-based

            result.append(
                ExtractedTable(
                    page=page_num,
                    headers=headers,
                    rows=rows,
                    accuracy=accuracy,
                )
            )
        return result
    finally:
        os.unlink(tmp_path)


class CamelotTableExtractor:
    """TableExtractor implementation using Camelot."""

    async def extract(self, pdf: PdfContent, span: Span) -> ExtractedTables:
        loop = asyncio.get_running_loop()
        tables = await loop.run_in_executor(None, functools.partial(_extract_tables_sync, pdf.data))
        span.set(table_count=len(tables))
        return ExtractedTables(tables=tables)
