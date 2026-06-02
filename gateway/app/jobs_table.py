"""Azure Table Storage implementation of JobStore protocol."""

import logging

from azure.data.tables import TableServiceClient

from .protocols import JobMeta, JobStatus
from .tables import Table

logger = logging.getLogger(__name__)


class TableJobStore:
    """JobStore backed by Azure Table Storage."""

    def __init__(self, service: TableServiceClient):
        service.create_table_if_not_exists(Table.GW_JOBS)
        self._table = service.get_table_client(Table.GW_JOBS)

    def create(self, meta: JobMeta) -> None:
        self._table.upsert_entity(_to_entity(meta))

    def get(self, user_id: str, job_id: str) -> JobMeta | None:
        try:
            entity = self._table.get_entity(user_id, job_id)
            return _from_entity(entity)
        except Exception as e:
            if "ResourceNotFound" in str(e) or "404" in str(e):
                return None
            raise

    def get_by_job_id(self, job_id: str) -> JobMeta | None:
        """Find a job by job_id across all users. Cross-partition scan."""
        entities = self._table.query_entities(f"RowKey eq '{job_id}'")
        for entity in entities:
            return _from_entity(entity)
        return None

    def update(self, meta: JobMeta) -> None:
        self._table.upsert_entity(_to_entity(meta))

    def list_for_user(self, user_id: str, limit: int = 50) -> list[JobMeta]:
        entities = self._table.query_entities(
            f"PartitionKey eq '{user_id}'",
            results_per_page=limit,
        )
        jobs = [_from_entity(e) for e in entities]
        jobs.sort(key=lambda j: j.created_at, reverse=True)
        return jobs[:limit]

    def mark_deleted(self, user_id: str, job_id: str) -> bool:
        meta = self.get(user_id, job_id)
        if meta is None:
            return False
        meta.status = JobStatus.DELETED
        self.update(meta)
        return True

    def list_expired(self, before: str) -> list[JobMeta]:
        entities = self._table.query_entities(
            f"status ne '{JobStatus.DELETED}' and retention_expires ne '' and retention_expires lt '{before}'"
        )
        return [_from_entity(e) for e in entities]

    def list_processing(self, older_than: str) -> list[JobMeta]:
        entities = self._table.query_entities(f"status eq '{JobStatus.PROCESSING}' and created_at lt '{older_than}'")
        return [_from_entity(e) for e in entities]

    def list_deleted(self) -> list[JobMeta]:
        entities = self._table.query_entities(f"status eq '{JobStatus.DELETED}'")
        return [_from_entity(e) for e in entities]

    def strip_pii(self, user_id: str) -> int:
        entities = self._table.query_entities(f"PartitionKey eq '{user_id}'")
        count = 0
        for entity in entities:
            entity["original_filename"] = ""
            entity["status"] = JobStatus.DELETED
            self._table.upsert_entity(entity)
            count += 1
        return count


def _to_entity(meta: JobMeta) -> dict:
    return {
        "PartitionKey": meta.user_id,
        "RowKey": meta.job_id,
        "sub_id": meta.sub_id,
        "key_name": meta.key_name,
        "original_filename": meta.original_filename,
        "mime_type": meta.mime_type,
        "input_bytes": meta.input_bytes,
        "input_hash": meta.input_hash,
        "status": meta.status,
        "detail": meta.detail,
        "created_at": meta.created_at,
        "completed_at": meta.completed_at,
        "retention_expires": meta.retention_expires,
        "steps": meta.steps,
        "price_per_unit": meta.price_per_unit,
    }


def _from_entity(entity: dict) -> JobMeta:
    return JobMeta(
        user_id=entity["PartitionKey"],
        job_id=entity["RowKey"],
        sub_id=entity.get("sub_id", ""),
        key_name=entity.get("key_name", ""),
        original_filename=entity.get("original_filename", "document"),
        mime_type=entity.get("mime_type", ""),
        input_bytes=int(entity.get("input_bytes", 0)),
        input_hash=entity.get("input_hash", ""),
        status=entity.get("status", "processing"),
        detail=entity.get("detail", entity.get("error_detail", "")),
        created_at=entity.get("created_at", ""),
        completed_at=entity.get("completed_at", ""),
        retention_expires=entity.get("retention_expires", ""),
        steps=entity.get("steps", ""),
        price_per_unit=float(entity.get("price_per_unit", 0.0)),
    )
