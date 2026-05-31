# Table Schema Redesign

## Problems with current schema

1. **Users is a god-table** — auth, billing, quotas, permissions, encryption keys, admin notes all in one entity.
2. **No change history** — admin changes to quotas/permissions are invisible.
3. **No per-key quotas** — only per-user limits.
4. **No pricing snapshot on jobs** — can't determine what price applied at billing time.
5. **Redundant audit tables** — separate audit logs when append-only data tables capture the same information.
6. **GwEncryptionKeys PK** — uses table name as partition key (meaningless).
7. **Dedup is confusing** — resubmitting a file returns a stale job with an old TTL.

## Design principles

- **Separate concerns**: auth identity, permissions, billing config, key management.
- **Append-only where audit matters**: UserConfig, UserPermissions, ApiKeys all append new versions. Current state = latest row (inverted timestamp RK). Full history preserved. Every row also carries a human-readable ISO `timestamp` column.
- **Full snapshots**: append-only rows contain all fields, not deltas. Reading current state = one row.
- **Gateway tables stay separate**: portal writes, gateway reads. Clear ownership.
- **No separate audit tables**: append-only data tables ARE the audit trail.
- **Stamp billing context on jobs**: `price_per_unit` at submission time.
- **No dedup**: every submission creates a new job. `input_hash` preserved for history search.
- **Quota resets sync with billing cycle**.

---

## Agreed tables

### GwJobs

Job metadata. Single mutable row per job. Gateway writes, both read.

| PK | RK | Column | Type | Purpose |
|---|---|---|---|---|
| user_id | job_id | | | |
| | | sub_id | string | API key ID |
| | | key_name | string | Key display name (denormalized) |
| | | original_filename | string | Sanitized filename |
| | | mime_type | string | Content type |
| | | input_bytes | int | Input size |
| | | input_hash | string | File hash (for history search, not dedup) |
| | | status | string | `processing` / `ok` / `error` / `deleted` |
| | | detail | string | Error message or other context |
| | | created_at | string | ISO submission timestamp |
| | | completed_at | string | ISO completion timestamp |
| | | retention_expires | string | Blob expiry |
| | | steps | string | JSON processing steps |
| | | price_per_unit | number | $/100KB at submission time |

### GwEncryptionKeys

Per-user encryption key. Portal writes on user creation, gateway reads. Immutable after creation.

| PK | RK | Column | Type | Purpose |
|---|---|---|---|---|
| "key" | user_id | | | |
| | | key_hex | string | AES-256 key (64 hex chars) |

### Users (auth identity only)

Core identity. Written by next-auth adapter on first sign-in. Immutable after creation.

| PK | RK | Column | Type | Purpose |
|---|---|---|---|---|
| "user" | user_id | | | |
| | | email | string | Email address |
| | | emailVerified | string | ISO timestamp |
| | | createdAt | string | Account creation |

Email lookup:

| PK | RK | Column | Type | Purpose |
|---|---|---|---|---|
| "email" | email | | | |
| | | userId | string | → user_id |

### UserConfig (append-only)

Billing and quota settings. Full snapshot per version. Changed by admins or users (spend cap).

| PK | RK | Column | Type | Purpose |
|---|---|---|---|---|
| user_id | inverted_ts_uuid | | | |
| | | timestamp | string | ISO timestamp (human-readable) |
| | | freeUnits | number/null | Monthly free units (500 = 50MB), null = unlimited |
| | | maxKeys | number | Max API keys allowed |
| | | pricePerUnit | number | $/100KB |
| | | spendCapKB | number/null | User-set monthly spend cap, null = no cap |
| | | changedBy | string | User ID (admin or self) or `"system"` |

Initial version created by `onCreateUser` with `changedBy: "system"`.

### UserPermissions (append-only)

Permission and account state. Full snapshot per version.

| PK | RK | Column | Type | Purpose |
|---|---|---|---|---|
| user_id | inverted_ts_uuid | | | |
| | | timestamp | string | ISO timestamp (human-readable) |
| | | isAdmin | bool | Admin portal access |
| | | blocked | bool | Account blocked (abuse — all API access denied) |
| | | stripeCustomerId | string | Stripe customer link |
| | | changedBy | string | Admin user ID or `"system"` |

### Billing

Invoice data. Stripe webhook (future) or usage reporter writes, portal reads.

**Invoice** (PK: `"invoice"`, RK: `invoiceId`):

| Column | Type | Purpose |
|---|---|---|
| customerId | string | Stripe customer ID |
| date | string | ISO invoice date |
| processedKB | number | KB processed |
| amount | number | USD amount |
| status | string | `paid` / `pending` |
| url | string/null | Stripe invoice URL |

**Customer** (PK: `"customer"`, RK: `customerId`) — local dev only:

| Column | Type | Purpose |
|---|---|---|
| email | string | Associated email |
| subscriptionId | string | Stripe subscription ID |

### Sessions, Accounts, VerificationTokens

Next-auth managed. No changes.

---

### GwSubscriptions

API key → user resolution + per-key quota. Portal writes, gateway reads. Mutable.

| PK | RK | Column | Type | Purpose |
|---|---|---|---|---|
| "subscription" | key_id | | | |
| | | user_id | string | Key owner |
| | | key_name | string | Display name (denormalized for job metadata) |
| | | quota_kb | number/null | Per-key quota, null = unlimited |

No usage counter here — usage is derived from GwJobs (see quota enforcement below).

### ApiKeys (append-only)

Key lifecycle. Each event (create, rotate, delete, quota change) appends a new row. Current state = latest row per `keyId`.

| PK | RK | Column | Type | Purpose |
|---|---|---|---|---|
| user_id | inverted_ts_uuid | | | |
| | | timestamp | string | ISO timestamp (human-readable) |
| | | keyId | string | Stable key identifier |
| | | displayName | string | User-friendly name |
| | | primaryKey | string | API key secret (null if deleted) |
| | | quotaKB | number/null | Per-key quota, null = unlimited |
| | | status | string | `active` / `deleted` |
| | | action | string | `create` / `rotate` / `delete` / `update_quota` |

Portal syncs to GwSubscriptions on create/delete/quota change.

---

## Quota enforcement

### Usage derived from jobs — no counters

Usage is computed by scanning GwJobs for the current calendar month. No separate usage counter on any table.

**GwJobs RK format**: `{YYYY-MM}_{job_id}` (e.g. `2026-06_job-a1b2c3`)

This enables fast range scans per month:

```
PK eq '{user_id}' and RK ge '2026-06' and RK lt '2026-07'
```

This is a partition + RK range query — the fastest pattern Table Storage supports.

### Quota check flow (per request)

```
1. Resolve key → user via GwSubscriptions (cached in Redis)
2. Check Redis: GET user:{id}:usage:2026-06
   → If cached: compare against per-key quota + user spend cap
   → If over: reject 429
3. Cache miss: scan GwJobs for current month, sum input_bytes
   → Cache result in Redis (short TTL, e.g. 60s)
4. Submit job
5. After job completes: Redis INCRBY user:{id}:usage:2026-06
```

### Per-key quota check

Same pattern but scoped by key:

```
PK eq '{user_id}' and RK ge '2026-06' and RK lt '2026-07'
→ filter in memory by sub_id eq '{key_id}'
→ sum input_bytes
→ compare against per-key quota_kb from GwSubscriptions
```

Or maintain a separate Redis counter per key: `key:{key_id}:usage:2026-06`.

### Quota levels

| Level | Source | Enforcement |
|---|---|---|
| Per-key quota | `quota_kb` on GwSubscriptions | Gateway checks before accepting job |
| User spend cap | `spendCapKB` on UserConfig | Gateway checks total user usage for month |
| User free tier | `freeUnits` on UserConfig | Not a hard limit — determines billing threshold |

### Calendar month billing

- All quotas reset on the 1st of each month (UTC midnight)
- Stripe subscriptions anchored to calendar month (`billing_cycle_anchor`)
- New users get full quota for their signup month (generous, simple)
- Redis usage counters naturally namespace by `YYYY-MM` — no explicit reset needed

---

## Removed tables

| Table | Reason |
|---|---|
| AdminAuditLog | Redundant — UserConfig and UserPermissions are append-only with `changedBy` |
| UserAuditLog | Redundant — ApiKeys is append-only with `action` field |
| Billing Usage | Redundant — usage derived from jobs or tracked on gateway tables |

## Removed features

| Feature | Reason |
|---|---|
| Dedup (input_hash gate) | Confusing UX — stale TTLs, invisible caching. `input_hash` kept for history search. |
| `actions` column on GwJobs | Redundant with `steps` |
| `deleted` flag on GwJobs | Merged into `status: "deleted"` |
| `encryptionKey` on Users | Only needed on GwEncryptionKeys |
| `notes` on Users | Un-timestamped, no attribution. Admin commentary via append-only tables. |
| `name` / `image` on Users | GDPR — email-only auth, no PII beyond email |

## Migration approach

1. Create new tables alongside existing
2. Backfill: split current Users into Users + UserConfig + UserPermissions
3. Convert current ApiKeys rows into initial `create` events
4. Update portal to read/write new tables
5. Update gateway for new GwEncryptionKeys PK, remove dedup
6. Drop old columns and tables after verification
7. No downtime — old and new coexist during rollout
