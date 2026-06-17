# Upstream error handling and bad job management

## Done

- **Retry with error classification**: `retry.py` retries transient failures (timeouts, resets, 429, 5xx) with exponential backoff and fails fast on permanent errors (4xx, TLS), raising typed `TransientUpstreamError` / `PermanentUpstreamError` exceptions.
- **Structured error propagation**: `process_canonize.py` classifies errors into `transient` / `permanent` / `internal` categories, stored in job metadata so the worker and API can report them.
- **Error hook**: `worker.py` calls `on_job_error()` on failure, which currently logs the structured error; quota is refunded automatically.

## Future: rate limit bad submissions

Track per-key failure rate for user-caused errors (4xx from our validation, not upstream 5xx) and throttle repeat offenders. The existing rejection counter in `quota.py` only tracks quota violations.

### Steps

1. Add a per-key failure counter in `quota.py` that increments when a job fails with `error_category == "permanent"` (i.e. the user submitted bad input).
2. Use a sliding window (e.g. Redis sorted set keyed by timestamp) rather than a simple counter, so the rate decays over time.
3. Wire the increment into `on_job_error()` so it fires after every permanent failure.
4. At submission time, check the failure rate alongside the existing quota check and reject with a clear message if the threshold is exceeded.
5. Choose thresholds — e.g. 10 permanent failures in a 1-hour window — and make them configurable.

## Future: known-bad file blocklist

Hash-based rejection at the gateway. Document hashing already exists (`hash.py` / `document_hash()`), but nothing checks against a blocklist.

### Steps

1. Create a blocklist store (start with a simple set in Redis or a config file) mapping file hashes to rejection reasons.
2. After computing the document hash at submission time, check it against the blocklist before enqueuing.
3. Return a clear rejection to the user if the file is blocked.
4. Build an operational workflow for adding hashes: an admin endpoint or CLI command that adds a hash + reason after discovering a problematic file (zip bomb, crash-inducing PDF, etc.).
5. Decide whether to integrate external hash databases (CSAM, malware) — this is a compliance/legal decision with significant implications and should be scoped separately.
