# Job Lifecycle & Delivery System

## Summary

Replace the current synchronous request-response flow with a proper async job lifecycle: accept work, process, deliver results via configurable actions, retain blobs per-user encryption with configurable TTLs.

## Current State

- Gateway long-polls Redis for result, returns synchronously
- Input blob deleted immediately after processing
- Output blob deleted on first GET /result
- One shared encryption key
- No webhooks, no S3 delivery, no retention

## Target Architecture

```
POST /convert → 202 + job_id (always async)

                    ┌─────────────┐
                    │   Gateway    │
                    │  (enqueue)   │
                    └──────┬──────┘
                           │ Redis Streams: jobs
                           ▼
                    ┌─────────────┐
                    │   Worker     │
                    │  (convert)   │
                    └──────┬──────┘
                           │ Redis Streams: deliveries
                           ▼
                    ┌─────────────┐
                    │  Delivery    │
                    │   Worker     │──→ Webhook POST (signed)
                    │              │──→ S3 PUT (user bucket)
                    │              │──→ (future: email, etc.)
                    └──────┬──────┘
                           │
                    Result always available via
                    GET /result/{job_id} until TTL expires
```

## API Contract

### POST /convert

Always returns 202.

```json
{
  "job_id": "abc123",
  "status": "processing",
  "poll_url": "/result/abc123",
  "estimated_seconds": 12
}
```

Headers: `Location: /result/abc123`

**Time estimates** (based on MIME type and file size, computed at submission):

| Type | Estimate |
|---|---|
| Passthrough (text, JSON, CSV) | 1-2s |
| MarkItDown (docx, xlsx, HTML) | 2-5s |
| PDF (Docling) | 2s base + ~6s per MB |
| Image (captioning) | 5-8s per image |
| Legacy (LibreOffice) | 30-90s (cold start + conversion + re-process) |

Per-request overrides via query params:
- `?result_retention=1h` — override default retention for this job
- `?webhook=https://...` — one-off webhook for this job
- `?s3=bucket/prefix` — one-off S3 destination for this job

### GET /result/{job_id}

| Status | Meaning |
|---|---|
| 200 | Done — body contains full result |
| 202 | Still processing — poll again |
| 404 | Unknown job ID or expired |
| 410 | Job completed but result retention expired |
| 500 | Job failed — body contains error detail |

Headers on 202: `Retry-After: <seconds>` (remaining estimate)

Multiple GETs return the same result (no delete-on-read).

## Deduplication

Identical files submitted by the same key return the existing job instead of creating a new one.

**Dedup key**: `dedupe:{sub_id}:{document_hash}` in Redis, TTL = result_retention.

**Flow**:
1. Gateway hashes file (xxhash, already computed for billing headers)
2. Check `dedupe:{sub_id}:{hash}` in Redis
3. **Hit**: return 202 with the existing job_id. No quota charge, no enqueue.
4. **Miss**: check quota, record usage (immediate deduction), enqueue job, set dedupe key, return 202.

**Quota at submission**: usage is recorded when the job is accepted, not when processing completes. This prevents users from submitting many jobs to exceed their quota before any finish processing.

**Refund on failure**: if the worker fails to process a job, it decrements the usage counter (refund) and deletes the dedupe key so the user can retry.

**Cache convergence**: deduplication is effectively result caching for identical files. Phase 3 "opt-in caching" just extends this with configurable TTLs and cross-key caching.

## Per-Key Configuration (portal)

Stored in Table Storage alongside existing per-key quota config.

| Setting | Default | Range | Description |
|---|---|---|---|
| `result_retention` | 24h | 10min — 1 month | How long output blob is kept |
| `input_retention` | 0 | 0 — 1 month | How long input blob is kept (0 = delete after processing) |
| `webhook_url` | none | — | URL to POST on job completion |
| `webhook_secret` | auto-generated | — | HMAC-SHA256 key for signing webhook payloads |
| `s3_destination` | none | — | `s3://bucket/prefix` for result delivery |
| `s3_credentials` | none | — | Stored encrypted in Key Vault, referenced by ID |

Per-request query params override per-key defaults for that job.

## Delivery Worker

Separate Container App (same image, `python -m app.delivery`). Reads from a `deliveries` Redis Stream.

### Delivery message (enqueued by conversion worker on completion)

```json
{
  "job_id": "abc123",
  "sub_id": "sub_xxx",
  "user_id": "user_yyy",
  "output_blob_key": "abc123/output",
  "actions": ["webhook", "s3"],
  "webhook_url": "https://...",
  "webhook_secret": "whsec_...",
  "s3_destination": "s3://bucket/prefix/abc123.md",
  "s3_credentials_ref": "kv:s3-creds-user_yyy"
}
```

### Delivery actions

Each action is independent — webhook failure doesn't block S3 delivery.

**Webhook:**
- POST to user's URL with JSON body (same shape as GET /result response)
- Signed with HMAC-SHA256: `X-Canonizr-Signature: sha256=<hex>`
- Retry: 3 attempts, exponential backoff (5s, 30s, 120s)
- On final failure: mark delivery as `delivery_failed`, trigger email alert

**S3:**
- PUT to user-provided bucket/key using user-provided credentials
- Credentials stored encrypted in Key Vault (per-user encryption key)
- Retry: 3 attempts, same backoff
- On final failure: same alert path

### Webhook failure alerting

When all retries exhausted:
1. Mark job status as `delivery_failed` in Redis
2. Send email to key owner (the email on their account)
3. **Cooldown**: max 1 failure email per hour per key. Prevents inbox flooding if their endpoint is down.
4. **Manual cooldown reset**: user can reset via portal (or API) to get immediate alerts again after fixing their endpoint
5. `delivery_failed` jobs visible in portal dashboard with retry button

## Blob Storage

### Storage accounts

| Account | Service | Purpose | Durability |
|---|---|---|---|
| `stcanonizrprod` (existing) | Azure Files | Ephemeral job blobs — shared mount between gateway/worker. Seconds lifetime. | Disposable |
| `stcanonizrresultsprod` (new) | Azure Blob Storage | Retained inputs + outputs. Hours to 1 month. Lifecycle-managed. | Durable, backed up |
| `stcanonizrportalprod` (existing) | Table Storage | Users, keys, quotas, watermarks | Critical |

Azure Files stays for the fast ephemeral path (shared mount, no SDK calls needed during hot loop). Blob Storage handles everything with retention.

### Blob naming

Blob paths are system-controlled — no user-supplied strings in storage keys:

```
{user_id}/{job_id}/input.bin       # encrypted original file
{user_id}/{job_id}/output.md       # encrypted markdown result
{user_id}/{job_id}/meta.json       # job metadata (unencrypted)
```

The original filename is stored as a plain string field in `meta.json`, never used in blob paths. This avoids path traversal, encoding issues, and shell metacharacter risks from user-supplied filenames.

`meta.json` contains:
- `original_filename` — as uploaded, used only for display and `Content-Disposition` headers on download
- `mime_type`, `upload_timestamp`, `retention_expiry`, `job_status`, `billing_info`

On download, the API reads `original_filename` from `meta.json` and sets:
```
Content-Disposition: attachment; filename="report.docx.md"
```

This means:
- Blob paths are always safe — predictable, no sanitization needed
- User sees familiar filenames in the portal and downloads
- User-scoped prefix enables per-user listing, bulk deletion on account delete, and clean crypto-shredding

### Lifecycle management

Azure Blob Storage lifecycle rule deletes all blobs older than 31 days (hard cap). Application deletes earlier based on per-key `result_retention` config. Belt and suspenders — even if the app fails to clean up, Azure handles it.

### Per-user encryption

- Each user gets an AES-256-GCM key generated on signup (already in portal spec)
- Stored in Table Storage, encrypted with the user's Key Vault reference
- Used for all blob encryption (input + output) on the retained store
- Account deletion = delete key = crypto-shredding of all retained data
- Ephemeral job blobs (Azure Files) continue using the shared `ENCRYPTION_KEY` — they live seconds and are deleted after processing
- Retained blobs use the per-user key — they may live up to a month

### Blobstore interface

Two implementations behind the same interface:

```python
class BlobStore(Protocol):
    async def get(self, key: str) -> bytes | None: ...
    async def put(self, key: str, data: bytes) -> None: ...
    async def delete(self, key: str) -> None: ...
    async def list_prefix(self, prefix: str) -> list[str]: ...
```

- `FileBlobStore` — current Azure Files implementation (ephemeral jobs)
- `AzureBlobStore` — new Azure Blob Storage implementation (retained results)

`list_prefix` is new — needed for per-user listing in the portal and bulk deletion on account delete.

## Redis Key Changes

```
result:{job_id}           → serialized JobResult (status, status_code, error_detail). TTL = result_retention (default 24h)
dedupe:{sub_id}:{hash}    → job_id. TTL = result_retention (default 24h)
sub:{sub_id}:bytes        → cumulative usage counter (existing, unchanged)
```

Result key TTL increased from 300s to 86400s (24h default). Redis handles expiry.

## Implementation Order

### Now (always-202 + dedup)
1. **Always-202 API** — drop long-poll from gateway, return 202 immediately with estimated_seconds
2. **Deduplication** — check dedupe key before enqueue, return existing job_id on hit
3. **Quota at submission** — record usage immediately on accept, refund on worker failure
4. **`/result` changes** — return 202 (processing) instead of 404, stop delete-on-read
5. **Redis TTLs** — 24h TTL on result keys and dedupe keys
6. **Time estimates** — estimate_seconds based on MIME type and file size

### Next (retained storage + delivery)
7. **Azure Blob Storage backend** — new storage account, swap blobstore.py for retained blobs
8. **Per-user encryption** — per-user keys from Table Storage (depends on portal signup flow)
9. **Per-key retention config** — portal UI, gateway reads config, sets TTLs accordingly
10. **Delivery worker** — new entrypoint, reads delivery stream, executes webhook/S3 actions
11. **Webhook signing + retry** — HMAC signatures, exponential backoff, failure alerting
12. **S3 delivery** — PUT to user buckets with user credentials
13. **Failure alerting emails** — email on delivery failure, cooldown logic

## Resolved Decisions

- **Blob Storage**: new dedicated storage account for retained blobs (Azure Blob Storage with lifecycle policies). Existing `azurerm_storage_account.blobs` stays as-is for ephemeral job data on Azure Files. Separate accounts = separate access keys, backup policies, billing visibility. Ephemeral store is disposable; retained store holds customer data with SLA expectations.
- **Email provider**: Azure Communication Services for both webhook failure alerts and portal magic link emails (Auth.js). Single provider, single billing line.

## Open Questions

- **Webhook rate limiting**: should we cap outbound webhook calls per key to prevent abuse (user configures a webhook pointing at a target they want to flood)? Research how Stripe, GitHub, and other webhook providers handle this — rate limits, IP allowlisting, payload size caps, retry budgets. Note for future discussion.
