"""Azure Table Storage table names. Single source of truth for the gateway.

Must match portal/lib/table-names.ts exactly — both services read/write
the same tables.
"""

from enum import StrEnum


class Table(StrEnum):
    GW_SUBSCRIPTIONS = "GwSubscriptions"
    GW_ENCRYPTION_KEYS = "GwEncryptionKeys"
    GW_JOBS = "GwJobs"
