"""Usage reporter — queries App Insights for completed conversions and pushes
billable units to Stripe as meter events.

Runs as a Container App Job on a cron schedule (hourly). Same container image
as gateway/worker, different entrypoint: `python -m app.usage_report`.

Idempotency:
- Each Stripe meter event uses a deterministic identifier:
    {subscription_id}:{timestamp_epoch}:{document_hash}
  Stripe deduplicates on this, so re-running the same window is safe.

- A high-water mark (last reported timestamp) is stored in Azure Table Storage.
  On startup, the reporter queries from that point forward (with a buffer for
  log ingestion delay). This handles catch-up after outages.

Race conditions:
- Container App Job runs with parallelism=1, so only one instance at a time.
- If a run overruns, the next trigger queues rather than overlaps.
"""

import logging
import os
import sys
import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import stripe
from azure.identity import DefaultAzureCredential
from azure.monitor.query import LogsQueryClient, LogsQueryStatus  # pyright: ignore[reportPrivateImportUsage]

logger = logging.getLogger(__name__)

METER_EVENT_NAME = "conversion_bytes"


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ReporterConfig:
    """All external config needed by the reporter. Built from env vars in main()."""

    log_analytics_workspace_id: str
    stripe_secret_key: str
    table_storage_connection_string: str
    ingestion_delay_minutes: int = 10
    max_window_hours: int = 24

    @classmethod
    def from_env(cls) -> "ReporterConfig":
        workspace = os.environ.get("LOG_ANALYTICS_WORKSPACE_ID", "")
        stripe_key = os.environ.get("STRIPE_SECRET_KEY", "")
        table_conn = os.environ.get("TABLE_STORAGE_CONNECTION_STRING", "")

        missing = []
        if not workspace:
            missing.append("LOG_ANALYTICS_WORKSPACE_ID")
        if not stripe_key:
            missing.append("STRIPE_SECRET_KEY")
        if not table_conn:
            missing.append("TABLE_STORAGE_CONNECTION_STRING")
        if missing:
            raise ConfigError(f"Missing required env vars: {', '.join(missing)}")

        return cls(
            log_analytics_workspace_id=workspace,
            stripe_secret_key=stripe_key,
            table_storage_connection_string=table_conn,
        )


class ConfigError(Exception):
    pass


# ---------------------------------------------------------------------------
# Data
# ---------------------------------------------------------------------------


@dataclass
class UsageRecord:
    """A single billable request from App Insights."""

    subscription_id: str
    timestamp: datetime
    input_size_bytes: int
    document_hash: str
    status_code: int

    @property
    def billable_units(self) -> int:
        """Number of 100KB units (rounded up)."""
        return max(1, -(-self.input_size_bytes // 100_000))

    @property
    def event_identifier(self) -> str:
        """Deterministic ID for Stripe deduplication."""
        epoch = int(self.timestamp.timestamp())
        return f"{self.subscription_id}:{epoch}:{self.document_hash}"


@dataclass
class RunResult:
    """Outcome of a single reporting cycle. Used for audit logging."""

    window_start: datetime
    window_end: datetime
    records_found: int = 0
    pushed: int = 0
    skipped: int = 0
    total_billable_units: int = 0
    total_bytes: int = 0
    unique_subscriptions: int = 0
    status: str = "ok"
    error: str = ""
    duration_seconds: float = 0


# ---------------------------------------------------------------------------
# App Insights query
# ---------------------------------------------------------------------------

KQL_QUERY = """
ApiManagementGatewayLogs
| where ResponseCode == 200
| where TimeGenerated >= datetime('{start}') and TimeGenerated < datetime('{end}')
| where OperationId != ""
| extend inputBytes = toint(ResponseHeaders["X-Input-Size-Bytes"])
| extend docHash = tostring(ResponseHeaders["X-Document-Hash"])
| where isnotnull(inputBytes) and inputBytes > 0
| project TimeGenerated, ApimSubscriptionId, inputBytes, docHash, ResponseCode
| order by TimeGenerated asc
"""


def query_usage(workspace_id: str, start: datetime, end: datetime) -> list[UsageRecord]:
    """Query App Insights for billable requests in the given window."""
    credential = DefaultAzureCredential()
    client = LogsQueryClient(credential)

    query = KQL_QUERY.format(
        start=start.strftime("%Y-%m-%dT%H:%M:%SZ"),
        end=end.strftime("%Y-%m-%dT%H:%M:%SZ"),
    )

    response = client.query_workspace(workspace_id, query, timespan=(start, end))

    if response.status == LogsQueryStatus.FAILURE:
        raise RuntimeError(f"KQL query failed: {response}")

    if response.status == LogsQueryStatus.PARTIAL:
        logger.warning("KQL query returned partial results")
        tables = response.partial_data
    else:
        tables = response.tables

    records = []
    for table in tables:
        for row in table.rows:
            records.append(
                UsageRecord(
                    subscription_id=str(row[1]),
                    timestamp=row[0] if isinstance(row[0], datetime) else datetime.fromisoformat(str(row[0])),
                    input_size_bytes=int(row[2]),
                    document_hash=str(row[3]),
                    status_code=int(row[4]),
                )
            )

    return records


# ---------------------------------------------------------------------------
# Subscription → Stripe customer mapping (Azure Table Storage)
# ---------------------------------------------------------------------------


def load_subscription_map(connection_string: str) -> dict[str, str]:
    """Load APIM subscription ID → Stripe customer ID mapping from Table Storage."""
    from azure.data.tables import TableServiceClient

    service = TableServiceClient.from_connection_string(connection_string)
    table = service.get_table_client("users")

    mapping: dict[str, str] = {}
    try:
        entities = table.query_entities("PartitionKey eq 'subscription'")
        for entity in entities:
            apim_sub_id = entity["RowKey"]
            stripe_cust_id = entity.get("stripe_customer_id", "")
            if stripe_cust_id:
                mapping[apim_sub_id] = stripe_cust_id
    except Exception:
        logger.warning("Could not read subscription mappings — no mappings loaded", exc_info=True)

    return mapping


# ---------------------------------------------------------------------------
# High-water mark (Azure Table Storage)
# ---------------------------------------------------------------------------


def _get_table_client(connection_string: str, table_name: str):
    """Get a Table Storage client, creating the table if needed."""
    from azure.data.tables import TableServiceClient

    service = TableServiceClient.from_connection_string(connection_string)
    service.create_table_if_not_exists(table_name)
    return service.get_table_client(table_name)


def get_watermark(connection_string: str) -> datetime | None:
    """Read the last successfully reported timestamp."""
    table = _get_table_client(connection_string, "usagereporter")
    try:
        entity = table.get_entity("watermark", "last_reported")
        iso = entity.get("last_reported_utc", "")
        if iso:
            return datetime.fromisoformat(str(iso)).replace(tzinfo=UTC)
    except Exception:
        logger.debug("No watermark found", exc_info=True)
    return None


def set_watermark(connection_string: str, timestamp: datetime) -> None:
    """Write the last successfully reported timestamp."""
    table = _get_table_client(connection_string, "usagereporter")
    table.upsert_entity(
        {
            "PartitionKey": "watermark",
            "RowKey": "last_reported",
            "last_reported_utc": timestamp.isoformat(),
        }
    )


# ---------------------------------------------------------------------------
# Audit log (Azure Table Storage)
# ---------------------------------------------------------------------------


def write_audit_log(connection_string: str, result: RunResult) -> None:
    """Write a row to the audit table recording this run's outcome."""
    table = _get_table_client(connection_string, "usagereporteraudit")

    # RowKey is inverted timestamp so newest rows sort first in Table Storage
    inverted = str(99999999999 - int(datetime.now(UTC).timestamp()))

    table.upsert_entity(
        {
            "PartitionKey": "run",
            "RowKey": inverted,
            "window_start": result.window_start.isoformat(),
            "window_end": result.window_end.isoformat(),
            "records_found": result.records_found,
            "pushed": result.pushed,
            "skipped": result.skipped,
            "total_billable_units": result.total_billable_units,
            "total_bytes": result.total_bytes,
            "unique_subscriptions": result.unique_subscriptions,
            "status": result.status,
            "error": result.error[:1000] if result.error else "",
            "duration_seconds": round(result.duration_seconds, 2),
        }
    )


# ---------------------------------------------------------------------------
# Stripe meter event push
# ---------------------------------------------------------------------------


def push_meter_events(records: list[UsageRecord], sub_map: dict[str, str]) -> tuple[int, int]:
    """Push billable units to Stripe. Returns (pushed, skipped) counts."""
    pushed = 0
    skipped = 0
    unmapped_subs: set[str] = set()

    for record in records:
        customer_id = sub_map.get(record.subscription_id)
        if not customer_id:
            unmapped_subs.add(record.subscription_id)
            skipped += 1
            continue

        try:
            stripe.billing.MeterEvent.create(
                event_name=METER_EVENT_NAME,
                payload={
                    "value": str(record.billable_units),
                    "stripe_customer_id": customer_id,
                },
                identifier=record.event_identifier,
                timestamp=int(record.timestamp.timestamp()),
            )
            pushed += 1
        except stripe.InvalidRequestError as e:
            if "already exists" in str(e).lower() or "duplicate" in str(e).lower():
                logger.debug("Duplicate event %s — already reported", record.event_identifier)
                pushed += 1  # Already counted, not an error
            else:
                logger.error("Stripe error for %s: %s", record.event_identifier, e)
                skipped += 1

    if unmapped_subs:
        logger.warning(
            "Skipped %d records for %d unmapped subscriptions: %s", skipped, len(unmapped_subs), unmapped_subs
        )

    return pushed, skipped


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------


def compute_window(
    watermark: datetime | None,
    now: datetime,
    ingestion_delay_minutes: int,
    max_window_hours: int,
) -> tuple[datetime, datetime]:
    """Compute the query window (start, end) based on watermark and config."""
    end = now - timedelta(minutes=ingestion_delay_minutes)

    if watermark:
        start = watermark
    else:
        start = end - timedelta(hours=2)

    # Safety cap for catch-up after long outages
    max_window = timedelta(hours=max_window_hours)
    if (end - start) > max_window:
        start = end - max_window
        logger.warning("Window capped to %d hours", max_window_hours)

    return start, end


def run(cfg: ReporterConfig) -> RunResult:
    """Execute one usage reporting cycle. Returns the result for audit logging."""
    stripe.api_key = cfg.stripe_secret_key
    t0 = time.monotonic()
    now = datetime.now(UTC)

    watermark = get_watermark(cfg.table_storage_connection_string)
    start, end = compute_window(watermark, now, cfg.ingestion_delay_minutes, cfg.max_window_hours)

    if start >= end:
        logger.info("Nothing to report (start >= end)")
        return RunResult(window_start=start, window_end=end, status="noop", duration_seconds=time.monotonic() - t0)

    logger.info("Querying App Insights: %s → %s", start.isoformat(), end.isoformat())
    records = query_usage(cfg.log_analytics_workspace_id, start, end)
    logger.info("Found %d billable records", len(records))

    result = RunResult(
        window_start=start,
        window_end=end,
        records_found=len(records),
        total_billable_units=sum(r.billable_units for r in records),
        total_bytes=sum(r.input_size_bytes for r in records),
        unique_subscriptions=len({r.subscription_id for r in records}),
    )

    if records:
        sub_map = load_subscription_map(cfg.table_storage_connection_string)
        logger.info("Loaded %d subscription mappings", len(sub_map))
        result.pushed, result.skipped = push_meter_events(records, sub_map)
        logger.info("Pushed %d, skipped %d", result.pushed, result.skipped)

    set_watermark(cfg.table_storage_connection_string, end)
    result.duration_seconds = time.monotonic() - t0
    logger.info("Watermark advanced to %s", end.isoformat())
    return result


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    logger.info("Usage reporter starting")

    try:
        cfg = ReporterConfig.from_env()
    except ConfigError as e:
        logger.error(str(e))
        sys.exit(1)

    try:
        result = run(cfg)
        write_audit_log(cfg.table_storage_connection_string, result)
        logger.info("Finished: %s (%d pushed, %d skipped)", result.status, result.pushed, result.skipped)
    except Exception as e:
        logger.exception("Usage reporter failed")
        try:
            now = datetime.now(UTC)
            write_audit_log(
                cfg.table_storage_connection_string,
                RunResult(window_start=now, window_end=now, status="error", error=str(e)),
            )
        except Exception:
            logger.error("Failed to write error audit log", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
