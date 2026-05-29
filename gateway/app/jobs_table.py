"""Azure Table Storage implementation of JobStore protocol.

Production: uses DefaultAzureCredential (managed identity) with endpoint URL.
Tests (Azurite): uses connection string.
"""

import logging

from azure.data.tables import TableServiceClient

from .azure_auth import get_credential
from .protocols import JobMeta
from .tables import Table

logger = logging.getLogger(__name__)


def _make_table_service(*, endpoint: str = "", connection_string: str = "") -> TableServiceClient:
    if endpoint:
        credential = get_credential()
        if credential is None:
            raise ValueError("AZURE_CLIENT_ID required when using endpoint")
        return TableServiceClient(endpoint, credential=credential)
    elif connection_string:
        return TableServiceClient.from_connection_string(connection_string)
    else:
        raise ValueError("Either endpoint or connection_string is required")


class TableJobStore:
    """JobStore backed by Azure Table Storage."""

    def __init__(self, *, endpoint: str = "", connection_string: str = ""):
        service = _make_table_service(endpoint=endpoint, connection_string=connection_string)
        service.create_table_if_not_exists(Table.JOBS)
        self._table = service.get_table_client(Table.JOBS)

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
        meta.deleted = True
        self.update(meta)
        return True

    def strip_pii(self, user_id: str) -> int:
        entities = self._table.query_entities(f"PartitionKey eq '{user_id}'")
        count = 0
        for entity in entities:
            entity["original_filename"] = ""
            entity["deleted"] = True
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
        "error_detail": meta.error_detail,
        "actions": meta.actions,
        "created_at": meta.created_at,
        "completed_at": meta.completed_at,
        "retention_expires": meta.retention_expires,
        "deleted": meta.deleted,
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
        error_detail=entity.get("error_detail", ""),
        actions=entity.get("actions", ""),
        created_at=entity.get("created_at", ""),
        completed_at=entity.get("completed_at", ""),
        retention_expires=entity.get("retention_expires", ""),
        deleted=bool(entity.get("deleted", False)),
    )
