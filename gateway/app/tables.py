"""Azure Table Storage table names. Single source of truth."""

from enum import StrEnum


class Table(StrEnum):
    USERS = "users"
    ENCRYPTION_KEYS = "encryptionkeys"
    JOBS = "jobs"
