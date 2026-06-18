"""Integration tests for TableJobStore pagination against Azurite."""

import time

import pytest
from azure.data.tables import TableServiceClient

from app.jobs_table import TableJobStore
from app.protocols import JobMeta, JobStatus

from .conftest import AZURITE_TABLE_CONN


@pytest.fixture(scope="module")
def store():
    ts = TableServiceClient.from_connection_string(AZURITE_TABLE_CONN)
    return TableJobStore(ts)


def _make_meta(user_id: str, job_id: str, created_at: str) -> JobMeta:
    return JobMeta(
        user_id=user_id,
        job_id=job_id,
        sub_id="sub-1",
        key_id="test-key",
        original_filename="test.pdf",
        mime_type="application/pdf",
        input_bytes=100_000,
        status=JobStatus.PROCESSING,
        created_at=created_at,
    )


class TestListForUser:
    def test_empty_user(self, store: TableJobStore):
        page = store.list_for_user("nonexistent-user")
        assert page.jobs == []
        assert page.continuation is None

    def test_single_page(self, store: TableJobStore):
        uid = f"single-{time.time_ns()}"
        store.create(_make_meta(uid, "j1", "2026-01-01T00:00:00Z"))
        store.create(_make_meta(uid, "j2", "2026-02-01T00:00:00Z"))

        page = store.list_for_user(uid, page_size=20)
        assert len(page.jobs) == 2
        assert page.continuation is None

    def test_pagination_returns_all_items(self, store: TableJobStore):
        uid = f"paginate-{time.time_ns()}"
        store.create(_make_meta(uid, "a1", "2026-01-01T00:00:00Z"))
        store.create(_make_meta(uid, "a2", "2026-02-01T00:00:00Z"))
        store.create(_make_meta(uid, "a3", "2026-03-01T00:00:00Z"))

        # Page 1
        page1 = store.list_for_user(uid, page_size=2)
        assert len(page1.jobs) == 2
        assert page1.continuation is not None

        # Page 2
        page2 = store.list_for_user(uid, page_size=2, continuation=page1.continuation)
        assert len(page2.jobs) == 1
        assert page2.continuation is None

        # No overlap
        all_ids = {j.job_id for j in page1.jobs + page2.jobs}
        assert all_ids == {"a1", "a2", "a3"}

    def test_newest_first(self, store: TableJobStore):
        uid = f"order-{time.time_ns()}"
        store.create(_make_meta(uid, "old", "2026-01-01T00:00:00Z"))
        store.create(_make_meta(uid, "mid", "2026-06-01T00:00:00Z"))
        store.create(_make_meta(uid, "new", "2026-12-01T00:00:00Z"))

        page = store.list_for_user(uid)
        ids = [j.job_id for j in page.jobs]
        assert ids == ["new", "mid", "old"]


class TestAppendOnly:
    def test_get_returns_latest_event(self, store: TableJobStore):
        uid = f"append-{time.time_ns()}"
        meta = _make_meta(uid, "evolve", "2026-01-01T00:00:00Z")
        store.create(meta)

        fetched = store.get("evolve")
        assert fetched is not None
        assert fetched.status == JobStatus.PROCESSING

        meta.status = JobStatus.OK
        meta.completed_at = "2026-01-01T00:01:00Z"
        store.update(meta)

        fetched = store.get("evolve")
        assert fetched is not None
        assert fetched.status == JobStatus.OK
        assert fetched.completed_at == "2026-01-01T00:01:00Z"

    def test_update_keeps_single_index_row(self, store: TableJobStore):
        # The deterministic index RowKey means update() upserts in place — the user's
        # listing must show exactly one row reflecting the latest status, not a duplicate.
        uid = f"index-{time.time_ns()}"
        meta = _make_meta(uid, "j-idx", "2026-01-01T00:00:00Z")
        store.create(meta)

        meta.status = JobStatus.OK
        meta.completed_at = "2026-01-01T00:05:00Z"
        store.update(meta)

        page = store.list_for_user(uid)
        assert len(page.jobs) == 1
        assert page.jobs[0].status == JobStatus.OK

    def test_mark_deleted(self, store: TableJobStore):
        uid = f"delete-{time.time_ns()}"
        store.create(_make_meta(uid, "doomed", "2026-01-01T00:00:00Z"))

        assert store.mark_deleted("doomed") is True
        fetched = store.get("doomed")
        assert fetched is not None
        assert fetched.status == JobStatus.DELETED

    def test_mark_deleted_unknown(self, store: TableJobStore):
        assert store.mark_deleted("no-such-job") is False
