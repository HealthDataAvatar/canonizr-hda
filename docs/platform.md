# Canonizr Platform Reference

## Current State

- Always-202 async API: POST /convert returns 202 immediately, GET /result/{id} for polling
- Protocol-based architecture: BlobStore, JobStore, UserResolver, Queue behind protocols with pure handler functions
- Gateway (thin wiring) + Worker (job processing) + Docling + Gotenberg on Azure Container Apps (uksouth)
- Redis Streams job queue with consumer groups (at-least-once, XREADGROUP/XACK/XAUTOCLAIM)
- Azure Managed Redis (Balanced B0, ~$10/month) -- queue, result signals, dedupe, quota, user cache
- Azure Blob Storage for encrypted job blobs (per-user AES-256-GCM, lifecycle-managed)
- Azure Table Storage for job metadata (durable, queryable by user_id), user accounts, encryption keys
- Azure APIM (Consumption tier) for auth, rate limiting, usage logging
- Azure OpenAI GPT-4o for image captioning (DataZoneStandard, swedencentral)
- Gotenberg (scale-to-zero) for legacy format conversion (.doc, .xls, .ppt, .odt, .rtf -> PDF -> Docling)
- Usage reporter: Container App Job (hourly cron), KQL -> Stripe meter events, audit log
- Deduplication via xxhash -- identical files from same key return existing job_id
- Quota at submission with automatic refund on failure
- MIME type: trust client if specific, fall back to python-magic
- CI: GitHub Actions (lint + unit tests), integration tests via docker-compose + Azurite (local)
- Deploy: `make deploy` builds linux/amd64, pushes to ACR, runs `tofu apply`
- Terraform state in Azure Blob Storage backend (shared access for team)

## Pricing: $0.003 per 100KB, captioning included

- One universal unit: **per 100KB of input file size** (rounded up)
- Image captioning included -- no separate line item
- Only `200` responses are billed
- All formats charged the same way
- All formats billed uniformly — no passthrough exception. HTML is converted via MarkItDown; plain text and other LLM-readable formats pass through but are billed at actual size.

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

### Tested unit economics

| Document | Size | Docling | Captioning | Total time | Revenue | Cost | Margin |
|---|---|---|---|---|---|---|---|
| Multi-page PDF (images) | 2.1MB | 12s | 3 images, 1.5s | 13.6s | $0.063 | ~$0.005 | 92% |
| 1-page invoice (table) | 94KB | 8s | 1 image, 1s | 9s | $0.003 | ~$0.002 | 33% |
| Tiny text PDF | 540B | 2s | none | 2s | $0.003 | ~$0.0001 | 97% |
| Standalone image (PNG) | 1.8KB | n/a | 1 image, 6.8s | 6.8s | $0.003 | ~$0.0001 | 97% |
| HTML passthrough | 2.3KB | n/a | none | 0ms | $0.003 | ~$0 | ~100% |

Docling base overhead: ~2s regardless of content. Scales with document complexity (tables, layout) more than file size. Break-even at ~7.1 GB/month (~$220 standing cost / $0.003 per unit).

### Captioning provider

**Current**: Azure OpenAI GPT-4o (DataZoneStandard, swedencentral). ~$0.002/caption. Data stays within EU/EEA data zone.

**Tested and rejected**: GPT-5-nano -- 50x cheaper but ~7x slower on vision tasks (7s/image vs ~0.5s). Burns reasoning tokens even with `reasoning_effort: none`. `max_tokens` parameter rejected (requires `max_completion_tokens`). Unusable for interactive latency.

**Future candidates**: Phi-4 Multimodal (~$0.02/1M input) via Azure AI Foundry serverless. Much cheaper, no reasoning overhead, but untested for caption quality. Nebius (Qwen2.5-VL) deferred -- licensing complexity.

### Licensing

| Component | License | Action needed |
|---|---|---|
| Docling | MIT | None |
| MarkItDown | MIT | None |
| Azure OpenAI (GPT-4o) | Azure ToS | None |

## Architecture

### Current (deployed)

```
User --> APIM (auth, rate limit, logging) --> Gateway --> 202 Accepted
                                                  |
                                          Encrypt input --> Blob Storage
                                          Write job row --> Table Storage
                                          Enqueue       --> Redis Streams
                                                                |
                                                          Worker (dequeue)
                                                          /       |       \
                                                    Docling   Gotenberg   Azure OpenAI
                                                    (PDF)     (legacy)    (captioning)
                                                          \       |       /
                                                    Encrypt output --> Blob Storage
                                                    Update job row --> Table Storage
                                                    Result signal  --> Redis

User --> GET /result/{id} --> Gateway --> Table Storage (ownership, expiry)
                                     --> Redis (result signal)
                                     --> Blob Storage (decrypt output)
                                     --> 200 OK
```

Gateway is thin wiring: validates, resolves user, checks quota + dedup, encrypts to Blob Storage, writes job row to Table Storage, enqueues to Redis, returns 202. Worker does all processing. Both share state via Table Storage (job metadata), Blob Storage (files), and Redis (signals).

### Standing costs (~$220/month)

| Service | SKU | Monthly cost |
|---|---|---|
| Docling (Container App) | 2 vCPU / 4 GiB, min_replicas=1 | ~$130 |
| Gateway (Container App) | 0.5 vCPU / 1 GiB, min_replicas=1 | ~$30 |
| Worker (Container App) | 0.5 vCPU / 1 GiB, min_replicas=1 | ~$30 |
| Azure Managed Redis | Balanced B0, 1 GB | ~$10 |
| Container Registry | Basic | ~$5 |
| Log Analytics + App Insights | PerGB2018 | ~$2-5 |
| Gotenberg (Container App) | 1 vCPU / 2 GiB, min_replicas=0 | ~$0 (scale-to-zero) |
| Storage Account (Blob + Table) | Standard LRS | ~$1 |
| Key Vault | Standard | ~$0.03/10K ops |
| APIM | Consumption | ~$3.50/million calls |
| Azure OpenAI (GPT-4o) | DataZoneStandard, pay-per-token | Usage dependent |

Docling is the dominant cost. Scale-to-zero possible (saves ~$130/month) but adds 30-60s cold start. Keep at min_replicas=1 while testing; revisit when traffic patterns are known.

### Capacity

| Component | Current | Max (auto-scale) | Constraint |
|---|---|---|---|
| Docling | 1 replica | 3 replicas | CPU-bound, ~12s/PDF |
| Gateway | 1 replica | 5 replicas | Lightweight (async 202, no long-poll) |
| Worker | 1 replica | 3 replicas | Orchestration only |
| Gotenberg | 0 replicas | 3 replicas | Scale-to-zero, single-threaded per replica |
| Azure OpenAI | 10K TPM | Configurable | Bump to 50K+ before real traffic |

At 1 Docling replica: ~5 PDFs/minute. At 3: ~15 PDFs/minute (~21,600/day).

Gotenberg is single-threaded per replica — scales horizontally via `http_scale_rule` with `concurrent_requests=1` (Container Apps adds a replica per concurrent request). Capped at `max_replicas=3`. If all replicas are busy, the worker's HTTP request waits with retry/timeout. Worker replicas and Gotenberg max_replicas should scale together.

## Billing & Payments

### Model: post-paid, usage-based (Stripe)

Prepaid/credit model considered and rejected -- adds e-money regulation risk under UK Payment Services Regulations 2017, deferred revenue accounting complexity, and VAT timing ambiguity. Post-paid is legally simpler.

### Stripe setup

- **Meter**: `conversion_bytes` (sum aggregation, event payload key: `value`)
- **Product**: "Canonizr API"
- **Price**: $0.003/unit (1 unit = 100KB), monthly billing, metered
- **Free tier**: 500 included units/month (50MB) via Stripe included units
- **Billing period**: Monthly (anchor = signup date)
- Setup script: `infra/stripe/setup.py` (idempotent, safe to run repeatedly)

### Audit trail (APIM --> App Insights)

All billing headers logged at 100% sampling. Per-request record includes:

| Field | Source | Purpose |
|---|---|---|
| `apim_subscriptionId` | APIM built-in | Group by customer |
| `X-Input-Size-Bytes` | Backend response | Calculate billable units |
| `X-Billable-Units` | APIM outbound policy (calculated) | What the user is charged |
| `X-Document-Hash` | Backend response | Deduplicate / verify |
| `X-Processing-Pipeline` | Backend response | What actions ran |
| `X-Processing-Time-Ms` | Backend response | Compute cost attribution |
| `X-Captioning-Prompt-Tokens` | Backend response | Captioning cost |
| `X-Captioning-Completion-Tokens` | Backend response | Captioning cost |
| `X-Images-Captioned` | Backend response | Captioning volume |

Billing headers also forwarded to client in response for transparency.

### Usage reporting

Azure Function (timer, hourly) reads App Insights via KQL, maps subscriptions to Stripe customers via Table Storage, pushes meter events to Stripe.

### Quota enforcement (three layers)

| Layer | Where | What it catches |
|---|---|---|
| Rate limit | APIM policy (`rate-limit-by-key`) | Burst protection (e.g. 60 req/min per key) |
| Quota pre-check | Gateway (inbound, before processing) | Reads Redis usage, rejects if over quota. Checks `Content-Length` to block oversized files before wasting compute |
| Quota post-update | Gateway (outbound, after processing) | `INCRBY` Redis counter with actual `input_size_bytes` |

Per-key quotas optional -- users set them in the portal. Absent = unlimited (billed via Stripe). Abuse detection: Redis tracks rejected attempts per key (short TTL), escalating backoff on repeated rejections.

## Portal: canonizr.com

### Auth: Auth.js (self-hosted)

All user PII stays in Azure UK South. No third-party auth processor. OAuth (GitHub, Google) + magic link email. Session cookies.

Clerk rejected: consumer PII in US by default, EU hosting only on Enterprise tier, adds a data processor to GDPR chain. For a consumer product targeting UK users, self-hosted auth eliminates the data transfer question entirely.

### Signup flow

1. User signs up via Auth.js (OAuth or magic link)
2. User record + per-user AES-256 encryption key stored in Azure Table Storage (UK South)
3. Backend creates Stripe Customer with usage-based subscription (free tier via included units)
4. Backend calls APIM Management API --> creates subscription under `paid` product --> returns API key
5. User gets key instantly

APIM `paid` product: `approval_required = false`, `subscriptions_limit = 5` (multiple named keys).

### GDPR / consumer privacy

- Targeting consumers -- stronger protections than B2B
- All PII in Azure UK South (no US transfers)
- Auth.js self-hosted (no third-party processor for auth)
- Azure OpenAI DataZoneStandard (data stays in EU/EEA)
- Captioning = describing user's own images, returned to sender only -- low risk
- AI captions may be inaccurate -- terms of service must state this
- Per-user encryption keys enable crypto-shredding on account deletion
- Privacy policy required (plain language, Consumer Rights Act 2015)
- Cookie consent banner required (Auth.js uses session cookies)
- 14-day cooling-off period applies (Consumer Contracts Regulations 2013)

### Content filtering

Azure OpenAI content filter set to "Lax" (custom policy on `captioning` deployment). Jailbreak detection disabled (false positives on normal documents). Severity filters at High. Content filter rejections handled gracefully -- image returned unconverted, not a 502.

## Encryption & Data Retention

### Ephemeral job pipeline (default -- zero data retention)

1. Gateway encrypts file with AES-256-GCM --> blob storage
2. Job metadata enqueued to Redis Streams (no payload, just job ID)
3. Worker reads blob, decrypts, processes, encrypts result --> blob storage
4. Gateway long-polls Redis for completion signal, reads result blob, decrypts, returns to user
5. Both blobs deleted after retrieval

Encryption key stored in Azure Key Vault, accessed via user-assigned managed identities. Rotatable at any time -- ephemeral blobs live seconds, so rotation just fails in-flight jobs (user resubmits).

### Opt-in caching (future, Phase 3)

- Result stored against `{sub_id}:{document_hash}`
- Encrypted with per-user key (from Table Storage, not the job pipeline key)
- Fixed TTL tiers: `cache=short` (1h), `cache=long` (24h)
- Cache hits: `X-Cache: HIT` header, no reprocessing, free (not billed)
- `DELETE /cache/{doc_hash}` to purge early
- Account deletion = delete per-user key = crypto-shredding

### Storage separation

| Store | Purpose | Lifecycle | Durability |
|---|---|---|---|
| Azure Blob Storage (`stcanonizrresultsprod`) | Encrypted input + output files | Up to 31 days (lifecycle policy) | Durable |
| Azure Table Storage (`stcanonizrportalprod`) | Job metadata, user accounts, encryption keys, Stripe mappings | Permanent | Critical -- back up |
| Redis | Queue, result signals, dedupe keys, quota counters, user cache | Ephemeral (TTLs) | Persistent (RDB) but recoverable |

Job metadata in Table Storage is the durable record. Redis signals are ephemeral — if lost, unACKed jobs are reprocessed via XAUTOCLAIM. Blob Storage lifecycle policy hard-deletes after 31 days; application deletes earlier per retention config.

## Testing

| Layer | Tool | What it tests | Runs |
|---|---|---|---|
| Unit | pytest + fakes (no mocking) | Handlers, quota, queue, crypto, estimates, sanitization, keys | `make test-unit` (180 tests) |
| Integration | docker-compose (gateway, worker, Redis, Docling, Gotenberg, Azurite) | Full async round-trip, Blob/Table Storage, dedup, quota, legacy formats | `make test-integration` (27 tests) |
| Focus | docker-compose, @pytest.mark.focus only | Isolate specific integration tests | `make test-focus` |
| Smoke | pytest + requests against live APIM | Deployment verification, headers, end-to-end | `make test-smoke` (post-deploy) |

Architecture: pure handler functions tested with fakes (FakeBlobStore, FakeJobStore, FakeQueue, FakeUserResolver, FakeRedis). No patching in handler tests. Integration tests use Azurite for real Azure SDK calls, with isolated `test_sub` fixture per test (unique user seeded per test).

Coverage: `make test-unit` reports line coverage via pytest-cov.

**TODO**: Add diff coverage to CI (e.g. `diff-cover` against main branch) so PRs must cover new/changed lines. Not implemented yet — add when CI pipeline is formalized.

**TODO**: Stripe webhook endpoint to sync invoice/payment updates to Table Storage (billing table). Currently production queries Stripe directly via `StripeBillingStore`; local/test uses `TableBillingStore` against Azurite. A webhook would keep our local record authoritative and eliminate per-request Stripe API calls from the portal.

Pre-commit hook: `make install-hooks` (ruff format + ruff check). Hook self-validates against repo copy.

### Staging environment

Not needed yet. For stress testing, use a dedicated APIM subscription key against production — quota tracking isolates test traffic. Local load testing via docker-compose (k6/hey against the full stack) catches queue and worker bottlenecks without duplicate infrastructure. Revisit when there are paying customers and migrations need safe validation.

## Feature Gaps

| Feature | Status |
|---|---|
| Structured JSON extraction | Not supported -- markdown only |
| Document splitting (multi-doc PDFs) | Not supported |
| Legacy formats (.doc, .xls) | Supported via Gotenberg (scale-to-zero) |
| Async/webhook processing | Always-async (202). Webhook delivery Phase 3 |
| SOC2 / HIPAA compliance | Not certified |
| MCP server | Not supported (Phase 4) |

### Differentiators

- Image captioning included (most competitors don't offer it or charge extra)
- Simpler pricing -- one unit, one price, no surcharges
- Per-key spend caps for agentic workflows (unique feature)
- Zero data retention by default, with opt-in caching
- Lower cost base (no GPUs)

## Roadmap

**Phase 1 -- Billable API** (complete)
1. ~~Redis + job queue (Streams with consumer groups)~~ Done
2. ~~Encrypted blob storage~~ Done
3. ~~APIM paid product: approval_required = false~~ Done
4. ~~Audit trail: billing headers in App Insights~~ Done
5. ~~Stripe meters + usage reporting~~ Done — Container App Job (hourly cron), KQL → Stripe meter events, idempotent with high-water mark + audit log
6. ~~Passthrough billing fix~~ Done — HTML moved to MarkItDown, all formats billed at actual size

**Phase 2 -- Self-service portal**
7. canonizr.com (Next.js + Auth.js + Azure Table Storage)
8. Signup flow (Stripe customer + APIM subscription + API key)
9. Per-user encryption key (generated on signup, stored in Table Storage)
10. Usage dashboard (keys, consumption, billing -- reads from Stripe + Redis)
11. Per-key quotas (UI to set/manage, gateway enforces via Redis)

**Phase 3 -- Job lifecycle & delivery** (design: docs/issues/job-lifecycle.md)
12. ~~Always-202 async API~~ Done — gateway returns 202 immediately with estimated_seconds, /result returns 202 (processing) or 200 (done), deduplication via xxhash, quota at submission with refund on failure, 24h result TTL
13. ~~LibreOffice via Gotenberg~~ Done — scale-to-zero Container App, Gotenberg adapter (all legacy -> PDF -> Docling), .doc/.xls/.ppt/.odt/.rtf etc.
14. ~~Azure Blob Storage backend~~ Done — replaced Azure Files with Blob Storage SDK, lifecycle policy (31 day), per-user blob paths ({user_id}/{job_id}/), Table Storage for job metadata
15. ~~Per-user encryption~~ Done — per-user AES-256-GCM keys from Table Storage, no shared key, crypto-shredding on key deletion
16. Configurable retention — per-key result_retention (default 24h, 10min–1 month) and input_retention (default 0), portal UI + gateway enforcement
17. Delivery worker — separate Container App, reads delivery stream, executes actions (webhook, S3) independently
18. Webhook delivery — HMAC-signed POST, 3x retry with exponential backoff, failure email alerts with hourly cooldown per key
19. S3 delivery — PUT to user-provided buckets with user-provided credentials (stored encrypted in Key Vault)

**Phase 4 -- Production hardening**
20. Abuse detection (rejected attempt tracking, escalating backoff)
21. Security hardening — test malicious MIME types (client sends `text/html` but payload is a zip bomb, polyglot files, path traversal in filenames, etc.). Verify each pipeline handles mismatched types gracefully.
22. GPU evaluation for Docling (T4 scale-to-zero vs CPU always-on)
23. Monitoring/alerting (usage anomalies, error rate spikes)

**Phase 5 -- Growth**
23. MCP server (wraps async API into blocking tool calls for agents)
24. Privacy policy + terms of service
25. Admin dashboard — internal-only UI for inspecting users, queue state, per-user usage, error logs, usage reporter audit trail. Authenticated via HDA identity.
