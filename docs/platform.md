# Canonizr Platform Reference

## Current State

- Gateway (thin API) + Worker (job processing) + Docling on Azure Container Apps (uksouth)
- Redis Streams job queue with consumer groups for reliable delivery (at-least-once, XREADGROUP/XACK/XAUTOCLAIM)
- Azure Managed Redis (Balanced B0, ~$10/month)
- Azure APIM (Consumption tier) for auth, rate limiting, usage logging
- Azure OpenAI GPT-4o for image captioning (DataZoneStandard, swedencentral)
- Encrypted blob storage (AES-256-GCM) on Azure Files shared mount between gateway and worker
- Encryption key in Azure Key Vault, accessed via user-assigned managed identities
- LibreOffice disabled -- legacy formats (.doc, .xls, .ppt) rejected with 400
- CI: GitHub Actions (lint + unit tests), integration tests via docker-compose (local)
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
User --> APIM (auth, rate limit, logging) --> Gateway (enqueue) --> Redis Streams
                                                                        |
                                                                    Worker (dequeue)
                                                                    /           \
                                                              Docling        Azure OpenAI
                                                           (PDF/doc)        (captioning)
                                                                    \           /
                                                                  Encrypted blob
                                                                        |
                                                                    Gateway <-- long-poll
                                                                        |
                                                                      User
```

Gateway is thin: validate, check quota, encrypt file to blob, enqueue job metadata to Redis Streams, long-poll for result. Worker does all processing.

### Standing costs (~$220/month)

| Service | SKU | Monthly cost |
|---|---|---|
| Docling (Container App) | 2 vCPU / 4 GiB, min_replicas=1 | ~$130 |
| Gateway (Container App) | 0.5 vCPU / 1 GiB, min_replicas=1 | ~$30 |
| Worker (Container App) | 0.5 vCPU / 1 GiB, min_replicas=1 | ~$30 |
| Azure Managed Redis | Balanced B0, 1 GB | ~$10 |
| Container Registry | Basic | ~$5 |
| Log Analytics + App Insights | PerGB2018 | ~$2-5 |
| Storage Account (Files + state) | Standard LRS | ~$1 |
| Key Vault | Standard | ~$0.03/10K ops |
| APIM | Consumption | ~$3.50/million calls |
| Azure OpenAI (GPT-4o) | DataZoneStandard, pay-per-token | Usage dependent |

Docling is the dominant cost. Scale-to-zero possible (saves ~$130/month) but adds 30-60s cold start. Keep at min_replicas=1 while testing; revisit when traffic patterns are known.

### Capacity

| Component | Current | Max (auto-scale) | Constraint |
|---|---|---|---|
| Docling | 1 replica | 3 replicas | CPU-bound, ~12s/PDF |
| Gateway | 1 replica | 5 replicas | Lightweight |
| Worker | 1 replica | 3 replicas | Orchestration only |
| Azure OpenAI | 10K TPM | Configurable | Bump to 50K+ before real traffic |

At 1 Docling replica: ~5 PDFs/minute. At 3: ~15 PDFs/minute (~21,600/day).

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
| Azure Files (shared mount) | Ephemeral job blobs | Seconds to minutes | Disposable -- if lost, user resubmits |
| Cache service (future) | Opt-in cached results | Hours to days | Durable, backed up, separate lifecycle |
| Azure Table Storage | User accounts, Stripe mappings, per-user keys | Permanent | Critical -- back up |

Ephemeral and cache storage deliberately separated so infra changes to the job pipeline don't affect cached data.

## Testing

| Layer | Tool | What it tests | Runs |
|---|---|---|---|
| Unit | pytest + mocks | Quota logic, queue, crypto, response formatting | `make check` (CI + local) |
| Integration | docker-compose (gateway, worker, Redis, Docling) | Full queue round-trip, encryption, real Redis | `make test-integration` (local) |
| Smoke | pytest + requests against live APIM | Deployment verification, headers, end-to-end | `make test-smoke` (post-deploy) |

Pre-commit hook: `make install-hooks` (ruff format + ruff check). Hook self-validates against repo copy.

### Staging environment

Not needed yet. For stress testing, use a dedicated APIM subscription key against production — quota tracking isolates test traffic. Local load testing via docker-compose (k6/hey against the full stack) catches queue and worker bottlenecks without duplicate infrastructure. Revisit when there are paying customers and migrations need safe validation.

## Feature Gaps

| Feature | Status |
|---|---|
| Structured JSON extraction | Not supported -- markdown only |
| Document splitting (multi-doc PDFs) | Not supported |
| Legacy formats (.doc, .xls) | Planned -- LibreOffice container + job queue (Phase 3) |
| Async/webhook processing | Queue infrastructure deployed, webhook callbacks Phase 4 |
| SOC2 / HIPAA compliance | Not certified |
| MCP server | Not supported (Phase 4) |

### Differentiators

- Image captioning included (most competitors don't offer it or charge extra)
- Simpler pricing -- one unit, one price, no surcharges
- Per-key spend caps for agentic workflows (unique feature)
- Zero data retention by default, with opt-in caching
- Lower cost base (no GPUs)

## Roadmap

**Phase 1 -- Billable API** (in progress)
1. ~~Redis + job queue (Streams with consumer groups)~~ Done
2. ~~Encrypted blob storage~~ Done
3. ~~APIM paid product: approval_required = false~~ Done
4. ~~Audit trail: billing headers in App Insights~~ Done
5. Stripe meters + usage reporting Azure Function
6. ~~Passthrough billing fix~~ Done — HTML moved to MarkItDown, all formats billed at actual size

**Phase 2 -- Self-service portal**
7. canonizr.com (Next.js + Auth.js + Azure Table Storage)
8. Signup flow (Stripe customer + APIM subscription + API key)
9. Per-user encryption key (generated on signup, stored in Table Storage)
10. Usage dashboard (keys, consumption, billing -- reads from Stripe + Redis)
11. Per-key quotas (UI to set/manage, gateway enforces via Redis)

**Phase 3 -- Production hardening**
12. Result caching (encrypted, opt-in, separate durable store)
13. LibreOffice container (scale-to-zero, legacy format support)
14. Abuse detection (rejected attempt tracking, escalating backoff)
15. GPU evaluation for Docling (T4 scale-to-zero vs CPU always-on)

**Phase 4 -- Growth**
16. Webhook callbacks + delivery destinations (S3, webhook — per-key default with per-request override, writes to user-provided buckets)
17. MCP server
18. Privacy policy + terms of service
19. Monitoring/alerting (usage anomalies, error rate spikes)
