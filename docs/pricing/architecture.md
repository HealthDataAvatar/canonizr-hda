# Architecture: Current vs Proposed

## Current Architecture

```
User
 │
 ▼
APIM (auth, rate limit, logging)
 │
 ▼
┌─────────────────────────────────────────┐
│ Gateway (does everything)               │
│                                         │
│  1. Receive file                        │
│  2. Detect type                         │
│  3. Check quota (new, Redis)            │
│  4. Call Docling ─────────► Docling     │
│  5. Call captioning ──────► Azure OpenAI│
│  6. Handle 429s / errors                │
│  7. Record usage (Redis)                │
│  8. Return result                       │
│                                         │
│  Problems:                              │
│  - Upstream errors leak to user         │
│  - 429 from OpenAI vs quota are mixed   │
│  - Synchronous: user waits for all      │
│    processing to complete               │
│  - No retry without failing the request │
│  - Can't add LibreOffice without        │
│    making the gateway more complex      │
└─────────────────────────────────────────┘
```

## Proposed Architecture

```
User
 │
 ▼
APIM (auth, rate limit, logging)
 │
 ▼
┌──────────────────────────┐
│ Gateway (thin API layer)  │
│                           │
│  1. Receive file          │     ┌───────┐
│  2. Check quota ─────────►│     │ Redis │
│  3. Encrypt file          │◄────┤       │
│  4. Enqueue job ─────────►│     │       │
│  5. Long-poll for result  │◄────┤       │
│  6. Record usage ────────►│     │       │
│  7. Return result         │     └───────┘
│                           │
│  Never sees Docling,      │
│  OpenAI, or LibreOffice.  │
│  Only its own errors.     │
└──────────────────────────┘

                Redis Queue
                    │
                    ▼
┌──────────────────────────────────────────┐
│ Worker(s)                                │
│                                          │
│  1. Dequeue job                          │
│  2. Decrypt file                         │
│  3. Route by type:                       │
│     .doc/.xls ──► LibreOffice ──► PDF    │
│     PDF/DOCX ───► Docling                │
│     Image ──────► Captioning             │
│     HTML/text ──► Passthrough            │
│  4. Caption images ──► Azure OpenAI      │
│  5. Retry 429s silently (backoff)        │
│  6. Encrypt result                       │
│  7. Store in Redis                       │
│                                          │
│  Upstream errors handled here.           │
│  User never sees them.                   │
└──────────────────────────────────────────┘
        │           │            │
        ▼           ▼            ▼
    Docling    Azure OpenAI  LibreOffice
```

## Key differences

| Concern | Current | Proposed |
|---|---|---|
| Gateway role | Orchestrates everything | Thin API: quota, enqueue, return |
| Processing | Synchronous in request | Async worker(s) behind queue |
| Upstream 429s | Leak to user as errors | Retried silently by worker |
| Error sanitisation | Must distinguish own vs upstream errors | Gateway only has own errors |
| LibreOffice | Can't add without complexity | Worker routes by type |
| Scaling | Gateway + Docling coupled | Workers scale independently |
| Encryption | None | Per-user AES-256, encrypt at rest |
| Caching | None | Optional, keyed by document hash |
| Latency | User waits for full pipeline | Long-poll or 202 + poll |
| Failure | Single request fails entirely | Worker retries, job can be requeued |

## Migration path

The gateway doesn't need rewriting — it becomes the worker. The current `convert()` function moves into a worker process that reads from the queue. The gateway endpoint becomes a thin wrapper that enqueues and waits.

```
Current gateway = future worker + future thin gateway
```
