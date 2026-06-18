"""Tests for the SDK audit fixes: path traversal, cache hardening
(symlinks + private perms), retry_after, and the non-JSON error guard."""

from __future__ import annotations

import os

import pytest

from canonizr import Canonizr, CanonizrError, RateLimitError
from canonizr._transport import Response
from canonizr.cache import DiskCache, _safe_segment

from .fakes import FakeTransport, json_response_with_headers

# -- Path traversal (security P0) --


class TestPathTraversal:
    @pytest.mark.parametrize("bad", ["../x", "a/b", "..", ".", "", "x\\y", "a\x00b"])
    def test_cache_rejects_unsafe_names(self, tmp_path, bad):
        cache = DiskCache(cache_dir=tmp_path)
        with pytest.raises(ValueError):
            cache.put_artefact("hash", bad, b"data")
        with pytest.raises(ValueError):
            cache.get_artefact("hash", bad)
        with pytest.raises(ValueError):
            cache.artefact_path("hash", bad)

    def test_safe_name_passes(self, tmp_path):
        cache = DiskCache(cache_dir=tmp_path)
        cache.put_artefact("hash", "markdown", b"data")
        assert cache.get_artefact("hash", "markdown") == b"data"
        # The write stayed inside the cache dir.
        assert (tmp_path / "hash" / "markdown").read_bytes() == b"data"

    def test_traversal_does_not_escape_dir(self, tmp_path):
        cache = DiskCache(cache_dir=tmp_path / "cache")
        with pytest.raises(ValueError):
            cache.put_artefact("h", "../../escaped", b"pwned")
        assert not (tmp_path / "escaped").exists()

    def test_safe_segment_whitelist(self):
        # Legitimate gateway artefact names and url-safe job IDs pass.
        for good in ["page-1", "markdown", "page-labels", "image-12", "Ab3_xY-9z"]:
            assert _safe_segment(good) == good
        # Everything outside the charset is rejected (deny-by-default).
        for bad in ["../etc/passwd", "a/b", "..", ".", "", "\x00", "a\x00b", "x\\y", "a.b", "a b", "name;rm"]:
            with pytest.raises(ValueError):
                _safe_segment(bad)


# -- Symlink following + cache file permissions (security P2) --


class TestCacheHardening:
    def test_read_ignores_symlink_artefact(self, tmp_path):
        # A symlink planted in the cache must not be followed on read.
        cache = DiskCache(cache_dir=tmp_path)
        cache.put_artefact("h", "markdown", b"real")
        secret = tmp_path / "secret"
        secret.write_bytes(b"id_rsa contents")
        link = tmp_path / "h" / "evil"
        link.symlink_to(secret)
        assert cache.get_artefact("h", "evil") is None
        assert cache.artefact_path("h", "evil") is None

    def test_write_refuses_symlink(self, tmp_path):
        cache = DiskCache(cache_dir=tmp_path)
        cache.put_artefact("h", "markdown", b"real")  # creates entry dir
        target = tmp_path / "target"
        target.write_bytes(b"original")
        (tmp_path / "h" / "markdown").unlink()
        (tmp_path / "h" / "markdown").symlink_to(target)
        with pytest.raises(ValueError):
            cache.put_artefact("h", "markdown", b"pwned")
        assert target.read_bytes() == b"original"  # not written through

    def test_cache_dir_is_private(self, tmp_path):
        cache = DiskCache(cache_dir=tmp_path / "fresh")
        cache.put_artefact("h", "markdown", b"data")
        mode = os.stat(tmp_path / "fresh").st_mode & 0o777
        assert mode == 0o700


# -- retry_after carried on 429 outside the polling loop (correctness/api-dx P1) --


class TestRetryAfter:
    def test_submit_429_carries_retry_after(self):
        t = FakeTransport()
        t.enqueue(json_response_with_headers(429, {"detail": "slow down"}, {"retry-after": "42"}))
        client = Canonizr(transport=t)
        with pytest.raises(RateLimitError) as exc:
            client.canonize(__file__)
        assert exc.value.retry_after == 42.0

    def test_artefact_429_carries_retry_after(self):
        t = FakeTransport()
        t.enqueue(json_response_with_headers(429, {"detail": "slow"}, {"retry-after": "7"}))
        client = Canonizr(transport=t)
        with pytest.raises(RateLimitError) as exc:
            client.get_artefact("job1", "markdown")
        assert exc.value.retry_after == 7.0


# -- Non-JSON error body must still raise a CanonizrError (correctness P1) --


class TestMalformedResponse:
    def test_html_error_body_maps_to_canonizr_error(self):
        t = FakeTransport()
        t.enqueue(Response(status_code=502, body=b"<html>Bad Gateway</html>", headers={}))
        client = Canonizr(transport=t)
        # 5xx maps to JobFailedError; the point is it's a typed CanonizrError
        # carrying the (non-JSON) body as detail, not a raw JSONDecodeError.
        with pytest.raises(CanonizrError) as exc:
            client.get_artefact("job1", "markdown")
        assert "Bad Gateway" in str(exc.value)

    def test_empty_body_maps_to_canonizr_error(self):
        t = FakeTransport()
        t.enqueue(Response(status_code=500, body=b"", headers={}))
        client = Canonizr(transport=t)
        with pytest.raises(CanonizrError):
            client.delete("job1")
