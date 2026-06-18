"""Azure Table Storage implementation of JobStore protocol.

Two tables:
- GwJobs (append-only): PK = job_{id[:2]}, RK = {job_id}_{inverted_ts}_{rand}
  Each status transition appends a new row. Latest event sorts first.
- GwUserJobs (mutable index): PK = user_id, RK = {inverted_ts}_{job_id}
  Updated in place on each transition. Newest-first for portal pagination.
"""

import logging
import secrets
import time
from datetime import UTC, datetime

from azure.core.paging import PageIterator
from azure.data.tables import TableServiceClient

from .protocols import JobMeta, JobPage, JobStatus
from .tables import Table

logger = logging.getLogger(__name__)

MAX_EPOCH_MS = 9_999_999_999_999  # 13 digits, year 2286


def _inverted_ts() -> str:
    epoch_ms = int(time.time() * 1000)
    return str(MAX_EPOCH_MS - epoch_ms).zfill(13)


def _shard_pk(job_id: str) -> str:
    return f"job_{job_id[:2]}"


def _event_rk(job_id: str) -> str:
    return f"{job_id}_{_inverted_ts()}_{secrets.token_urlsafe(3)}"


def _index_rk(meta: JobMeta) -> str:
    """Deterministic index RowKey from created_at — identical at create() and every
    update(), so updates address the same row (no partition scan, no lost-update race).
    Inverted timestamp keeps the partition newest-first by document creation time.
    """
    try:
        epoch_ms = int(datetime.fromisoformat(meta.created_at).timestamp() * 1000)
    except (ValueError, TypeError):
        epoch_ms = int(time.time() * 1000)  # malformed/empty created_at — fall back to now
    return f"{str(MAX_EPOCH_MS - epoch_ms).zfill(13)}_{meta.job_id}"


class TableJobStore:
    """JobStore backed by Azure Table Storage (dual-table)."""

    def __init__(self, service: TableServiceClient):
        service.create_table_if_not_exists(Table.GW_JOBS)
        service.create_table_if_not_exists(Table.GW_USER_JOBS)
        self._jobs = service.get_table_client(Table.GW_JOBS)
        self._index = service.get_table_client(Table.GW_USER_JOBS)

    def create(self, meta: JobMeta) -> None:
        self._jobs.upsert_entity(_to_event(meta))
        self._index.upsert_entity(_to_index(meta))

    def get(self, job_id: str) -> JobMeta | None:
        """Get latest state for a job. Range scan on job_id prefix, first row = latest."""
        pk = _shard_pk(job_id)
        entities = self._jobs.query_entities(
            f"PartitionKey eq '{pk}' and RowKey ge '{job_id}_' and RowKey lt '{job_id}_~'",
            results_per_page=1,
        )
        for entity in entities:
            return _from_event(entity)
        return None

    def update(self, meta: JobMeta) -> None:
        """Append a new event to GwJobs and upsert the GwUserJobs index in place.

        The index RowKey is deterministic from created_at (see `_index_rk`), so this
        addresses the exact row created at create() time — no scan, no lost-update race.
        If the index row is somehow missing, upsert recreates it (reconciliation).
        """
        self._jobs.upsert_entity(_to_event(meta))
        self._index.upsert_entity(_to_index(meta))

    def mark_deleted(self, job_id: str) -> bool:
        meta = self.get(job_id)
        if meta is None:
            return False
        meta.status = JobStatus.DELETED
        now = datetime.now(UTC)
        if not meta.retention_expires or datetime.fromisoformat(meta.retention_expires) > now:
            meta.retention_expires = now.isoformat()
        self.update(meta)
        return True

    def list_for_user(self, user_id: str, page_size: int = 20, continuation: str | None = None) -> JobPage:
        """List jobs for a user, newest first, with cursor pagination."""
        query = f"PartitionKey eq '{user_id}'"
        pager: PageIterator = self._index.query_entities(  # type: ignore[assignment]
            query, results_per_page=page_size
        ).by_page(continuation)

        try:
            page = next(pager)
        except StopIteration:
            return JobPage(jobs=[])

        jobs = [_from_index(e) for e in page]
        return JobPage(jobs=jobs, continuation=pager.continuation_token)

    def list_expired(self, before: str) -> list[JobMeta]:
        return self._scan_all_shards(
            f"status ne '{JobStatus.DELETED}' and retention_expires ne '' and retention_expires lt '{before}'"
        )

    def list_deleted(self) -> list[JobMeta]:
        return self._scan_all_shards(f"status eq '{JobStatus.DELETED}'")

    def list_processing(self, older_than: str) -> list[JobMeta]:
        return self._scan_all_shards(f"status eq '{JobStatus.PROCESSING}' and created_at lt '{older_than}'")

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _scan_all_shards(self, extra_filter: str) -> list[JobMeta]:
        """Scan GwJobs across all shards. Returns latest event per job."""
        # We need to deduplicate: multiple events per job, we want latest (first per prefix)
        seen: dict[str, JobMeta] = {}
        entities = self._jobs.query_entities(extra_filter)
        for entity in entities:
            job_id = entity["job_id"]
            if job_id not in seen:
                seen[job_id] = _from_event(entity)
        return list(seen.values())


# ---------------------------------------------------------------------------
# Entity mapping — GwJobs (append-only events)
# ---------------------------------------------------------------------------


def _to_event(meta: JobMeta) -> dict:
    return {
        "PartitionKey": _shard_pk(meta.job_id),
        "RowKey": _event_rk(meta.job_id),
        "job_id": meta.job_id,
        "user_id": meta.user_id,
        "sub_id": meta.sub_id,
        "job_type": meta.job_type,
        "key_id": meta.key_id,
        "original_filename": meta.original_filename,
        "mime_type": meta.mime_type,
        "input_bytes": meta.input_bytes,
        "input_hash": meta.input_hash,
        "status": meta.status,
        "detail": meta.detail,
        "period_start": meta.period_start,
        "created_at": meta.created_at,
        "completed_at": meta.completed_at,
        "retention_expires": meta.retention_expires,
        "steps": meta.steps,
        "price_per_unit": meta.price_per_unit,
        "artefacts": meta.artefacts,
    }


def _from_event(entity: dict) -> JobMeta:
    return JobMeta(
        user_id=entity.get("user_id", entity.get("PartitionKey", "")),
        job_id=entity.get("job_id", ""),
        sub_id=entity.get("sub_id", ""),
        job_type=entity.get("job_type", ""),
        key_id=entity.get("key_id", ""),
        original_filename=entity.get("original_filename", "document"),
        mime_type=entity.get("mime_type", ""),
        input_bytes=int(entity.get("input_bytes", 0)),
        input_hash=entity.get("input_hash", ""),
        status=entity.get("status", "processing"),
        detail=entity.get("detail", ""),
        period_start=entity.get("period_start", ""),
        created_at=entity.get("created_at", ""),
        completed_at=entity.get("completed_at", ""),
        retention_expires=entity.get("retention_expires", ""),
        steps=entity.get("steps", ""),
        price_per_unit=float(entity.get("price_per_unit", 0.0)),
        artefacts=entity.get("artefacts", ""),
    )


# ---------------------------------------------------------------------------
# Entity mapping — GwUserJobs (mutable index)
# ---------------------------------------------------------------------------


def _index_fields(meta: JobMeta) -> dict:
    """Fields written to the index row (subset of JobMeta).

    Note: steps is intentionally excluded — it's large and only needed
    for admin trace view (lazy-loaded from GwJobs by job ID).
    """
    return {
        "job_id": meta.job_id,
        "job_type": meta.job_type,
        "key_id": meta.key_id,
        "original_filename": meta.original_filename,
        "mime_type": meta.mime_type,
        "input_bytes": meta.input_bytes,
        "status": meta.status,
        "detail": meta.detail,
        "created_at": meta.created_at,
        "completed_at": meta.completed_at,
        "retention_expires": meta.retention_expires,
        "artefacts": meta.artefacts,
        "price_per_unit": meta.price_per_unit,
    }


def _to_index(meta: JobMeta) -> dict:
    return {
        "PartitionKey": meta.user_id,
        "RowKey": _index_rk(meta),
        **_index_fields(meta),
    }


def _from_index(entity: dict) -> JobMeta:
    return JobMeta(
        user_id=entity["PartitionKey"],
        job_id=entity.get("job_id", ""),
        sub_id="",  # not stored in index
        job_type=entity.get("job_type", ""),
        key_id=entity.get("key_id", ""),
        original_filename=entity.get("original_filename", "document"),
        mime_type=entity.get("mime_type", ""),
        input_bytes=int(entity.get("input_bytes", 0)),
        status=entity.get("status", "processing"),
        detail=entity.get("detail", ""),
        created_at=entity.get("created_at", ""),
        completed_at=entity.get("completed_at", ""),
        retention_expires=entity.get("retention_expires", ""),
        artefacts=entity.get("artefacts", ""),
        price_per_unit=float(entity.get("price_per_unit", 0.0)),
    )
