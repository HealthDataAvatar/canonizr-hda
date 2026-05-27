# Canonizr Platform Reference

## Current State

- Gateway + Docling on Azure Container Apps (uksouth)
- Azure APIM (Consumption tier) for auth, rate limiting, usage logging
- Azure OpenAI GPT-4o for image captioning (DataZoneStandard, swedencentral)
- LibreOffice disabled — legacy formats (.doc, .xls, .ppt) rejected with 400
- CI/CD via GitHub Actions, manual deploy via Makefile
- Terraform (OpenTofu) manages all infrastructure in `rg-canonizr-prod`

## Pricing: $0.003 per 100KB, captioning included

- One universal unit: **per 100KB of input file size** (rounded up)
- Image captioning included — no separate line item
- Only `200` responses are billed
- All formats charged the same way
- **Exception**: passthrough formats (HTML, plain text) are billed as 1KB regardless of actual size. Needs upstream gateway change to report `input_bytes: 1024` when pipeline is `passthrough`.

### Why this model
- Universal across all formats (PDF, HTML, DOCX, spreadsheets, images)
- No ambiguity about what a "page" is
- Captioning cost on GPT-4o (~$0.002/document) is negligible against per-100KB pricing
- Simpler than every competitor: one price, one unit, no surcharges

### Competitive landscape (May 2026)

| Competitor | Price | Unit | Captioning |
|---|---|---|---|
| LlamaParse | $0.003-0.14/page | Per page | No |
| Unstructured | $0.03/page | Per page (100KB for non-PDF) | Yes, included |
| Reducto | $0.015/page | Per page (credit) | No |
| Google Document AI | $0.01-0.065/page | Per page | No |
| AWS Textract | ~$0.015/page | Per page | No |
| Azure Document Intelligence | ~$0.01/page | Per page | No |
| **Canonizr** | **$0.003/100KB** | **Per 100KB** | **Yes, included** |


### Cost base
- Standing infra: ~$194/month (Docling 2 vCPU/4GiB is the bulk)
- Per-request compute: ~$0.002-0.01
- Per-caption (GPT-4o): ~$0.002/document — negligible against pricing
- Verify against real Azure bills, not estimates

### Captioning provider

**Current**: Azure OpenAI GPT-4o (~$0.004/caption). Already deployed, covered by Azure credits.

**Tested**: GPT-5-nano — 50x cheaper but ~7x slower on vision tasks (7s/image vs ~0.5s). Reasoning tokens consumed even with `reasoning_effort: none`. Unusable for interactive latency. Revisit when vision performance improves.

**Decision**: Stay on GPT-4o. Cost per caption (~$0.002) is negligible against $0.003/100KB pricing. Latency matters more than token cost.

Nebius (Qwen2.5-VL) was considered but deferred — licensing complexity (attribution, MAU cap) and more expensive than GPT-5-nano.

### Licensing

| Component | License | Action needed |
|---|---|---|
| Docling | MIT | None |
| MarkItDown | MIT | None |
| Azure OpenAI (GPT-4o/5) | Azure ToS | None |

## Feature Gaps

| Feature | Status |
|---|---|
| Structured JSON extraction | Not supported — markdown only |
| Document splitting (multi-doc PDFs) | Not supported |
| Async/webhook processing | Planned — via job queue (see below) |
| SOC2 / HIPAA compliance | Not certified |
| MCP server | Not supported |
| Legacy formats (.doc, .xls) | Planned — via LibreOffice container + job queue |

### Differentiators
- Image captioning included (same as Unstructured, but most competitors don't offer it)
- Simpler pricing — one unit, one price, no surcharges
- Lower cost base (no GPUs)

## Response Design

See [response-headers.md](response-headers.md) for full spec.

Key headers on all responses:
- `X-Input-Size-Bytes` — raw file size (billing unit)
- `X-Images-Captioned` — count of captioned images (transparency, not billed separately)
- `X-Document-Hash` — SHA-256 for audit trail and deduplication

## Platform: canonizr.com

### Architecture

- **Portal**: Next.js on canonizr.com
- **Auth**: Auth.js (self-hosted, OAuth + magic link email, all PII in Azure UK South)
- **Billing**: Stripe usage-based billing with meters
- **Key provisioning**: Portal calls APIM Management API to create subscriptions
- **Quota enforcement**: Redis (real-time, in gateway request lifecycle)
- **Usage reporting**: Azure Function (timer) reads Redis counters, pushes to Stripe Meter Events API

Clerk rejected (consumer PII in US, adds third-party data processor). APIM Developer Portal rejected (needs Standard tier +$150/mo, still generic). Third-party monetisation layers (Zuplo etc.) rejected (unnecessary vendor between us and APIM).

### Signup flow

1. User signs up via Auth.js (GitHub/Google OAuth or magic link email)
2. User record stored in Azure Table Storage (UK South)
3. Backend creates Stripe Customer with usage-based subscription (free tier via included units)
4. Backend calls APIM Management API → creates subscription under `paid` product → returns API key
5. User mapping stored in Azure Table Storage
6. User gets their key instantly

APIM `paid` product: `approval_required = false`, `subscriptions_limit = 5` (multiple named keys).

### Stripe billing

- **Billing period**: Monthly (anchor = signup date)
- **Meter**: `conversion_bytes` (sum of `X-Input-Size-Bytes`)
- **Product**: "Canonizr API" with one usage-based price linked to the meter
- **Free tier**: Stripe included units (e.g. first 50MB/month free)
- **Usage reporting**: Azure Function (hourly) reads Redis counters per subscription → Stripe meter events

### Quota enforcement (three layers)

| Layer | Where | What it catches |
|---|---|---|
| Rate limit | APIM policy (`rate-limit-by-key`) | Burst protection — e.g. 60 req/min per key |
| Quota pre-check | Gateway (inbound, before processing) | Reads Redis usage, rejects if over quota. Checks `Content-Length` against remaining quota to block oversized files before wasting compute |
| Quota post-update | Gateway (outbound, after processing) | `INCRBY` Redis counter with actual `input_size_bytes` |

Per-key quotas are optional — users set them in the portal. Absent = unlimited (billed via Stripe).

Abuse detection: Redis tracks rejected attempts per key (short TTL). Repeated rejections trigger escalating backoff or temporary block.

### Redis data model

```
sub:{sub_id}:bytes          # cumulative bytes this period (INCRBY, EXPIRE at period end)
sub:{sub_id}:quota:bytes    # user-configured limit (or absent = unlimited)
sub:{sub_id}:rejected       # rejected attempt count (short TTL)
```

Counters auto-reset via `EXPIRE`. The usage reporting job reads from the same counters — single source of truth.

### User mapping (Azure Table Storage)

```
| user_id | stripe_customer_id | apim_subscription_id | key_name | quota_bytes_monthly |
|---------|--------------------|-----------------------|----------|---------------------|
| usr_abc | cus_123            | sub_aaaa              | prod     | null                |
| usr_abc | cus_123            | sub_bbbb              | agent-1  | 524288000 (500MB)   |
```

### Infrastructure additions

- **Azure Cache for Redis** (Basic C0, ~$15/month) — same region, accessible from Container Apps
- **Azure Function** (Consumption plan) — usage reporting job, timer trigger
- **Azure Table Storage** — user mapping (Auth.js users, Stripe customers, APIM subscriptions)
- Redis connection string passed to gateway container as a secret

### Job queue architecture

Serves multiple purposes: legacy format conversion, captioning retry on 429s, Docling overflow, and result caching.

**Flow (default — zero data retention):**
1. File uploaded → encrypted with per-user AES-256 key → queued
2. Worker decrypts, processes (LibreOffice → Docling → captioning)
3. Encrypted result stored in Redis (5 min TTL)
4. Client collects result → deleted

**Flow (opt-in caching):**
1. Same as above, but result also stored against `{sub_id}:{document_hash}`
2. Same file sent again → cache hit → instant response, no reprocessing
3. Fixed TTL tiers controlled by us (e.g. `cache=short` 1h, `cache=long` 24h)
4. Response header: `X-Cache: HIT` or `X-Cache: MISS`

**Encryption:**
- Per-user AES-256 key generated on signup, stored in Azure Table Storage (alongside user mapping)
- All queued/cached data encrypted with user's key
- Account deletion = delete key → all cached data becomes unrecoverable (crypto-shredding)
- Even with access to Redis/blob storage, data is unreadable without the key

**API surface:**
```
POST /convert                    → synchronous (current behaviour, short jobs)
POST /convert                    → 202 + job_id (if processing exceeds timeout)
GET  /jobs/{job_id}              → poll for result
POST /convert?cache=short        → process + cache result for 1h
POST /convert?cache=long         → process + cache result for 24h
DELETE /cache/{doc_hash}         → purge cached result early
```

Gateway long-polls internally — callers still get a synchronous response for most requests. Only falls back to 202 + polling for slow jobs (LibreOffice conversions, large documents).

**Queue benefits beyond legacy formats:**
- Captioning 429s → requeue with backoff instead of failing
- Docling at capacity → queue instead of rejecting
- Natural backpressure and rate limiting

**Infrastructure:** Redis handles both queue and result storage. LibreOffice container (0.5 vCPU/1GiB, scale-to-zero) added for legacy formats. No additional services needed.

### What's already deployed

- APIM with `internal` (HDA free) and `paid` (metered) products
- `paid` product: `subscriptions_limit = 5`, subscription ID injected via inbound policy
- App Insights + Log Analytics logging all requests at 100% sampling
- Backend response headers logged: `X-Input-Size-Bytes`, `X-Images-Captioned`, `X-Document-Hash`, `X-Processing-Pipeline`
- Gateway returns billing headers on all 200 responses

### Remaining APIM changes

- `paid` product: flip `approval_required` from `true` to `false`
- Outbound policy: forward billing headers to client (currently only logged, not passed through)

### Roadmap

**Phase 1 — Billable API**
1. Redis (foundation for quotas, usage tracking, queue, caching)
2. Stripe meters + usage reporting Azure Function
3. APIM `paid` product: `approval_required = false`
4. Passthrough billing fix (upstream: report `input_bytes: 1024` for passthrough)

**Phase 2 — Self-service portal**
5. canonizr.com (Next.js + Auth.js + Azure Table Storage)
6. Signup flow (Stripe customer + APIM subscription + API key)
7. Per-user encryption key (generated on signup, stored in Table Storage)
8. Usage dashboard (keys, consumption, billing — reads from Stripe + Redis)
9. Per-key quotas (UI to set/manage, gateway enforces via Redis)

**Phase 3 — Production hardening**
10. Job queue (Redis-based, async processing, 429 retry, backpressure)
11. Result caching (encrypted, opt-in, `cache=short`/`cache=long`)
12. LibreOffice container (scale-to-zero, legacy format support)
13. Abuse detection (rejected attempt tracking, escalating backoff)

**Phase 4 — Growth**
14. Webhook callbacks
15. MCP server
16. Privacy policy + terms of service
17. Monitoring/alerting (usage anomalies, error rate spikes)
