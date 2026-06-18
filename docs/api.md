# Canonizr API

Base URL `https://api.canonizr.com`. Authenticate every request with
`Authorization: Bearer YOUR_API_KEY`.

The flow is: **submit a file → poll until done → download the result artefacts.**
A job is canonized into one or more *artefacts* (extracted markdown, page renders,
embedded images, tables); the poll response lists them, and you fetch each by name.

## POST /v1/canonize

Submit a file (multipart, field `file`, max 50 MB). Always returns **202**.

```json
{
  "job_id": "a1b2c3d4e5f6",
  "status": "processing",
  "poll_url": "/v1/canonize/a1b2c3d4e5f6",
  "estimated_seconds": 12,
  "input_bytes": 214500,
  "billable_units": 3,
  "retention_seconds": 86400
}
```

Headers: `Location` (poll URL), `Retry-After` (estimated seconds),
`X-Input-Size-Bytes`, `X-Billable-Units`.

## GET /v1/canonize/{job_id}

Poll for the result. Only the owning key can see a job.

- **202** — still processing. Respect `Retry-After`.
- **404** — unknown job, or a job that isn't yours (the two are indistinguishable).
- **410** — result expired (24 h retention) or deleted.
- **500** — processing failed; body has `detail`.
- **200** — done. Body is the metadata + artefact manifest:

```json
{
  "job_id": "a1b2c3d4e5f6",
  "status": "ok",
  "metadata": { "detected_type": "application/pdf", "input_bytes": 214500, "input_hash": "a1b2c3d4" },
  "artefacts": [
    { "name": "markdown", "mime_type": "text/markdown", "size_bytes": 1840, "label": "Extracted text" },
    { "name": "page-1", "mime_type": "image/png", "size_bytes": 50321 }
  ],
  "expires_at": "2026-06-19T12:00:00+00:00"
}
```

200 headers: `X-Input-Size-Bytes`, `X-Document-Hash`, `Content-Disposition`.

Artefact names depend on the input: `markdown` (extracted text), `image-N` (images —
one per page for multi-page TIFFs), `page-N`/`preview-N` (PDF page renders + thumbnails),
`table-N` (extracted tables, JSON), `page-labels`, `pdf` (the intermediate PDF for legacy
office formats).

## GET /v1/canonize/{job_id}/artefacts/{name}

Download one artefact's raw bytes (e.g. `…/artefacts/markdown`). Returns the content with
its `Content-Type` and a `Content-Disposition` filename. 404 if the name isn't in the
manifest, 410 if the job expired/was deleted.

## DELETE /v1/canonize/{job_id}

Delete a job's stored files immediately. **204** on success, **404** if unknown, **410**
if already gone. Metadata is retained for billing audit.

## GET /health

`{"status": "ok"}`. No auth.

## Status codes

| Code | Meaning |
|---|---|
| 200 | Result ready |
| 202 | Accepted / still processing |
| 204 | Deleted |
| 400 | Unsupported file type (incl. archives — extract and submit files individually) |
| 401 | Missing or invalid key |
| 404 | Unknown job, a job that isn't yours, or an unknown artefact name |
| 410 | Expired or deleted |
| 413 | File too large (50 MB) |
| 422 | A required converter isn't configured for this file type |
| 429 | Quota exceeded |
| 500 / 502 / 504 | Processing / upstream error / timeout |

## Quotas & billing

- Billed per **100 KB of input size**, rounded up, minimum 1 unit. All formats the same.
  `billable_units` is returned on the 202. Rates and free allowances are configured per
  customer — see the portal/billing.
- Charged on submission (the 202), **refunded automatically if the job fails**.
- Per-key monthly byte quotas are optional (set in the portal); exceeding one returns 429.

## Supported formats

| Format | Extensions | Handling | Typical time |
|---|---|---|---|
| PDF | `.pdf` | Text + tables + embedded images + page renders | 2–15 s |
| Office (modern) | `.docx`, `.pptx`, `.xlsx`, `.epub`, `.html`, `.eml`, `.msg` | MarkItDown → markdown | 2–5 s |
| Office (legacy) | `.doc`, `.xls`, `.ppt`, `.odt`, `.rtf` | LibreOffice → PDF pipeline | 30–90 s |
| Images | `.png`, `.jpg`, `.webp`, `.tiff`, `.heic`, `.avif` | Normalised to PNG (one per page) | 5–8 s |
| Text / code | `.txt`, `.md`, `.csv`, `.json`, `.xml`, source files | Passthrough | 1–2 s |
