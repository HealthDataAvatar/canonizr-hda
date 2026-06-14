"""Usage reporter — queries GwJobs for completed conversions and pushes
billable units to Stripe as meter events.

Runs as a Container App Job on a cron schedule (hourly). Same container image
as gateway/worker, different entrypoint: `python -m app.usage_report`.

Idempotency:
- Each Stripe meter event uses a deterministic identifier:
    {subscription_id}:{timestamp_epoch}:{job_id}
  Stripe deduplicates on this, so re-running the same window is safe.

- A high-water mark (last reported timestamp) is stored in Azure Table Storage.
  On startup, the reporter queries from that point forward.

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
from azure.data.tables import TableServiceClient

from .azure_clients import get_table_service
from .tables import Table

logger = logging.getLogger(__name__)

METER_EVENT_NAME = "conversion_bytes"


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ReporterConfig:
    """All external config needed by the reporter. Built from env vars in main()."""

    stripe_secret_key: str
    table_service: TableServiceClient
    max_window_hours: int = 24

    @classmethod
    def from_env(cls) -> "ReporterConfig":
        stripe_key = os.environ.get("STRIPE_SECRET_KEY", "")

        if not stripe_key:
            raise ConfigError("Missing required env var: STRIPE_SECRET_KEY")

        return cls(
            stripe_secret_key=stripe_key,
            table_service=get_table_service(),
        )


class ConfigError(Exception):
    pass


# ---------------------------------------------------------------------------
# Data
# ---------------------------------------------------------------------------


@dataclass
class UsageRecord:
    """A single billable job from GwJobs."""

    subscription_id: str
    timestamp: datetime
    input_size_bytes: int
    job_id: str

    @property
    def billable_units(self) -> int:
        """Number of 100KB units (rounded up)."""
        return max(1, -(-self.input_size_bytes // 100_000))

    @property
    def event_identifier(self) -> str:
        """Deterministic ID for Stripe deduplication."""
        epoch = int(self.timestamp.timestamp())
        return f"{self.subscription_id}:{epoch}:{self.job_id}"


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
# GwJobs query (replaces KQL/App Insights)
# ---------------------------------------------------------------------------


def query_usage_from_jobs(ts: TableServiceClient, start: datetime, end: datetime) -> list[UsageRecord]:
    """Query GwJobs table for completed jobs in the given time window."""
    table = ts.get_table_client(Table.GW_JOBS)

    start_iso = start.strftime("%Y-%m-%dT%H:%M:%SZ")
    end_iso = end.strftime("%Y-%m-%dT%H:%M:%SZ")

    # Cross-partition scan with server-side filter
    filter_expr = (
        f"completed_at ge '{start_iso}' and completed_at lt '{end_iso}' and status eq 'ok' and input_bytes gt 0"
    )

    records: list[UsageRecord] = []
    seen_jobs: set[str] = set()  # GwJobs is append-only; dedupe by job_id

    for entity in table.query_entities(filter_expr):
        job_id = str(entity.get("job_id", ""))
        if not job_id or job_id in seen_jobs:
            continue
        seen_jobs.add(job_id)

        completed_at_str = str(entity.get("completed_at", ""))
        try:
            completed_at = datetime.fromisoformat(completed_at_str).replace(tzinfo=UTC)
        except (ValueError, TypeError):
            continue

        records.append(
            UsageRecord(
                subscription_id=str(entity.get("sub_id", "")),
                timestamp=completed_at,
                input_size_bytes=int(entity.get("input_bytes", 0)),
                job_id=job_id,
            )
        )

    records.sort(key=lambda r: r.timestamp)
    return records


# ---------------------------------------------------------------------------
# Subscription → Stripe customer mapping (via GwSubscriptions + GwBilling)
# ---------------------------------------------------------------------------


def load_subscription_map(ts: TableServiceClient) -> dict[str, str]:
    """Load subscription ID → Stripe customer ID mapping.

    Resolution path: GwSubscriptions (sub_id → user_id) then GwBilling
    (user_id → stripe_customer_id). GwBilling is the single source of
    truth for Stripe customer IDs.
    """
    # Step 1: sub_id → user_id from GwSubscriptions
    sub_to_user: dict[str, str] = {}
    try:
        subs_table = ts.get_table_client(Table.GW_SUBSCRIPTIONS)
        for entity in subs_table.query_entities("PartitionKey eq 'subscription'"):
            sub_id = entity["RowKey"]
            user_id = entity.get("user_id", "")
            if user_id:
                sub_to_user[sub_id] = user_id
    except Exception:
        logger.warning("Could not read GwSubscriptions — no mappings loaded", exc_info=True)
        return {}

    if not sub_to_user:
        return {}

    # Step 2: user_id → stripe_customer_id from GwBilling
    user_to_customer: dict[str, str] = {}
    try:
        billing_table = ts.get_table_client(Table.GW_BILLING)
        for entity in billing_table.query_entities("PartitionKey eq 'billing'"):
            user_id = entity["RowKey"]
            cust_id = entity.get("stripe_customer_id", "")
            if cust_id:
                user_to_customer[user_id] = cust_id
    except Exception:
        logger.warning("Could not read GwBilling — no customer mappings loaded", exc_info=True)
        return {}

    # Step 3: combine
    mapping: dict[str, str] = {}
    for sub_id, user_id in sub_to_user.items():
        cust_id = user_to_customer.get(user_id)
        if cust_id:
            mapping[sub_id] = cust_id

    return mapping


# ---------------------------------------------------------------------------
# High-water mark (Azure Table Storage)
# ---------------------------------------------------------------------------


def _get_table_client(ts: TableServiceClient, table_name: str):
    """Get a Table Storage client, creating the table if needed."""
    ts.create_table_if_not_exists(table_name)
    return ts.get_table_client(table_name)


def get_watermark(ts: TableServiceClient) -> datetime | None:
    """Read the last successfully reported timestamp."""
    table = _get_table_client(ts, "usagereporter")
    try:
        entity = table.get_entity("watermark", "last_reported")
        iso = entity.get("last_reported_utc", "")
        if iso:
            return datetime.fromisoformat(str(iso)).replace(tzinfo=UTC)
    except Exception:
        logger.debug("No watermark found", exc_info=True)
    return None


def set_watermark(ts: TableServiceClient, timestamp: datetime) -> None:
    """Write the last successfully reported timestamp."""
    table = _get_table_client(ts, "usagereporter")
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


def write_audit_log(ts: TableServiceClient, result: RunResult) -> None:
    """Write a row to the audit table recording this run's outcome."""
    table = _get_table_client(ts, "usagereporteraudit")

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
    max_window_hours: int,
) -> tuple[datetime, datetime]:
    """Compute the query window (start, end) based on watermark and config."""
    end = now

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

    watermark = get_watermark(cfg.table_service)
    start, end = compute_window(watermark, now, cfg.max_window_hours)

    if start >= end:
        logger.info("Nothing to report (start >= end)")
        return RunResult(window_start=start, window_end=end, status="noop", duration_seconds=time.monotonic() - t0)

    logger.info("Querying GwJobs: %s → %s", start.isoformat(), end.isoformat())
    records = query_usage_from_jobs(cfg.table_service, start, end)
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
        sub_map = load_subscription_map(cfg.table_service)
        logger.info("Loaded %d subscription mappings", len(sub_map))
        result.pushed, result.skipped = push_meter_events(records, sub_map)
        logger.info("Pushed %d, skipped %d", result.pushed, result.skipped)

    set_watermark(cfg.table_service, end)
    result.duration_seconds = time.monotonic() - t0
    logger.info("Watermark advanced to %s", end.isoformat())
    return result


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    logging.getLogger("azure").setLevel(logging.WARNING)
    logger.info("Usage reporter starting")

    try:
        cfg = ReporterConfig.from_env()
    except ConfigError as e:
        logger.error(str(e))
        sys.exit(1)

    try:
        result = run(cfg)
        write_audit_log(cfg.table_service, result)
        logger.info("Finished: %s (%d pushed, %d skipped)", result.status, result.pushed, result.skipped)
    except Exception as e:
        logger.exception("Usage reporter failed")
        try:
            now = datetime.now(UTC)
            write_audit_log(
                cfg.table_service,
                RunResult(window_start=now, window_end=now, status="error", error=str(e)),
            )
        except Exception:
            logger.error("Failed to write error audit log", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
