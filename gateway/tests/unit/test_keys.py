"""Unit tests for Redis key construction."""

from app.keys import (
    dedupe,
    encryption_key_cache,
    job_result,
    key_name_cache,
    quota_limit,
    quota_rejected,
    quota_usage,
    user_id_cache,
)


class TestKeyFormats:
    def test_user_id_cache(self):
        assert user_id_cache(sub_id="sub_123") == "sub:sub_123:user_id"

    def test_key_name_cache(self):
        assert key_name_cache(sub_id="sub_123") == "sub:sub_123:key_name"

    def test_encryption_key_cache(self):
        assert encryption_key_cache(user_id="user_abc") == "userkey:user_abc"

    def test_quota_usage(self):
        assert quota_usage(sub_id="sub_123") == "sub:sub_123:bytes"

    def test_quota_limit(self):
        assert quota_limit(sub_id="sub_123") == "sub:sub_123:quota:bytes"

    def test_quota_rejected(self):
        assert quota_rejected(sub_id="sub_123") == "sub:sub_123:rejected"

    def test_job_result(self):
        assert job_result(job_id="abc123") == "result:abc123"

    def test_dedupe(self):
        assert dedupe(sub_id="sub_1", doc_hash="hash_xyz") == "dedupe:sub_1:hash_xyz"

    def test_all_use_keyword_args(self):
        """Verify positional args are rejected (keyword-only enforcement)."""
        import inspect

        for fn in [
            user_id_cache,
            key_name_cache,
            encryption_key_cache,
            quota_usage,
            quota_limit,
            quota_rejected,
            job_result,
            dedupe,
        ]:
            sig = inspect.signature(fn)
            for param in sig.parameters.values():
                assert param.kind == inspect.Parameter.KEYWORD_ONLY, (
                    f"{fn.__name__}: parameter '{param.name}' should be keyword-only"
                )
