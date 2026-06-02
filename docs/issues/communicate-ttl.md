User files don't stay in storage forever.

We need to communicate the TTL to users,
and we need to let users set this per request,
and to let them set a default per API key.

## Decisions

### Storage: per-key in GwSubscriptions

Store `retention_seconds` in GwSubscriptions alongside `quota_bytes`.
Different keys can have different retention policies (e.g. production key 7d, test key 1h).
No new tables, no UserConfig bloat.

Default: 86400 (24 hours), matching current hard-coded value.
Clamp to min/max (1 hour - 31 days).

### Per-request override

Accept per-request TTL via header (human-readable, e.g. `1h`, `7d`).
Not a common setting to change, so header is fine over query param.
Clamped to the subscription's max or system max.
Precedence: per-request > per-key default > system default (24h).

Only allow integer numbers followed by "h" or "d", and it must be an integer greater than 1, and presumably no longer than 5? digits long.

### Communicate in API responses

**POST /convert (202)**: include `retention_seconds` in the JSON body
so the caller knows the policy.

**GET /result (200)**: include `expires_at` (ISO 8601) in the JSON body.

### Portal

Show expiration time in the history table alongside job status when known.
Need to record the "actively deleted" state for audit logs.

Need to record blob deletion timestamp for audit logs too.
Should we be recording every blob CRUD timestamp (who/what/when)? Probably.

---
