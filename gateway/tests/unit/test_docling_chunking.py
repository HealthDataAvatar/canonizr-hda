"""Unit tests for Docling chunk merge logic — pure function, no I/O."""

from app.services.docling import merge_chunks


class TestMergeChunks:
    def test_preserves_order(self):
        results = [(2, "C", []), (0, "A", []), (1, "B", [])]
        md, pics = merge_chunks(results)
        assert md == "A\n\nB\n\nC"
        assert pics == []

    def test_concatenates_pictures(self):
        results = [(0, "x", [{"id": 1}]), (1, "y", [{"id": 2}, {"id": 3}])]
        md, pics = merge_chunks(results)
        assert md == "x\n\ny"
        assert pics == [{"id": 1}, {"id": 2}, {"id": 3}]

    def test_single_chunk(self):
        results = [(0, "# Only chunk", [{"id": "a"}])]
        md, pics = merge_chunks(results)
        assert md == "# Only chunk"
        assert pics == [{"id": "a"}]

    def test_many_chunks(self):
        results = [(i, f"## Page {i}", []) for i in reversed(range(10))]
        md, pics = merge_chunks(results)
        expected = "\n\n".join(f"## Page {i}" for i in range(10))
        assert md == expected

    def test_empty(self):
        md, pics = merge_chunks([])
        assert md == ""
        assert pics == []

    def test_pictures_follow_chunk_order(self):
        results = [
            (2, "c", [{"id": "c1"}]),
            (0, "a", [{"id": "a1"}, {"id": "a2"}]),
            (1, "b", [{"id": "b1"}]),
        ]
        md, pics = merge_chunks(results)
        assert [p["id"] for p in pics] == ["a1", "a2", "b1", "c1"]
