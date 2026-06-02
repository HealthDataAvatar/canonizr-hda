"""Redis key construction. Single source of truth for all key patterns.

Every Redis key used by the application is constructed here.
No f-string key construction elsewhere in the codebase.
"""


# -- User resolution cache --


def user_id_cache(*, sub_id: str) -> str:
    """Cache: subscription → user_id mapping."""
    return f"sub:{sub_id}:user_id"


def key_name_cache(*, sub_id: str) -> str:
    """Cache: subscription → API key name."""
    return f"sub:{sub_id}:key_name"


def encryption_key_cache(*, user_id: str) -> str:
    """Cache: user → encryption key hex."""
    return f"userkey:{user_id}"


# -- Quota --


def quota_usage(*, sub_id: str) -> str:
    """Counter: cumulative bytes used this billing period."""
    return f"sub:{sub_id}:bytes"


def quota_limit(*, sub_id: str) -> str:
    """Value: user-configured byte limit (absent = unlimited)."""
    return f"sub:{sub_id}:quota:bytes"


def quota_rejected(*, sub_id: str) -> str:
    """Counter: rejected request count (short TTL, escalating backoff)."""
    return f"sub:{sub_id}:rejected"


# -- User status --


def user_blocked(*, user_id: str) -> str:
    """Cache: whether user is blocked (short TTL)."""
    return f"user:{user_id}:blocked"


# -- Job queue --


def job_result(*, job_id: str) -> str:
    """Signal: job completion status (ok/error)."""
    return f"result:{job_id}"


def dedupe(*, sub_id: str, doc_hash: str) -> str:
    """Mapping: identical file → existing job_id."""
    return f"dedupe:{sub_id}:{doc_hash}"


def sweep_lock() -> str:
    """Lock: prevents concurrent sweep runs across workers."""
    return "sweep:lock"
