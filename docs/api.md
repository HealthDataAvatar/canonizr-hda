# Canonizr API

`https://apim-canonizr-prod.azure-api.net` — authenticate with `Ocp-Apim-Subscription-Key` header.

---

## POST /v1/jobs

Submit a file for conversion. Always returns 202.

```bash
curl -X POST https://apim-canonizr-prod.azure-api.net/v1/jobs \
  -H "Ocp-Apim-Subscription-Key: YOUR_API_KEY" \
  -F "file=@document.pdf"
```

**Parameters:**

| Name | In | Type | Default | Description |
|---|---|---|---|---|
| `file` | body | file | required | Multipart file upload (max 50MB) |
| `verbose` | query | bool | `false` | Include processing trace |
| `options` | query | JSON | `{}` | Reserved for future processing options |

**Response (202):**

```json
{
  "job_id": "a1b2c3d4e5f6",
  "status": "processing",
  "poll_url": "/v1/jobs/a1b2c3d4e5f6",
  "estimated_seconds": 12,
  "input_bytes": 214500,
  "billable_units": 3
}
```

| Header | Value |
|---|---|
| `Location` | `/v1/jobs/{job_id}` |
| `Retry-After` | Estimated seconds |
| `X-Input-Size-Bytes` | File size |
| `X-Billable-Units` | Units to be billed |

**Deduplication:** same file + same key within retention window returns the existing job. No re-processing, no additional charge.

---

## GET /v1/jobs/{job_id}

Poll for result.

**200** — done:

```json
{
  "markdown": "# Title\n\nContent...",
  "metadata": {
    "detected_type": "application/pdf",
    "input_bytes": 214500,
    "input_hash": "a1b2c3d4",
    "processing_time_ms": 3420,
    "actions": ["docling", "captioning"],
    "captioning": {
      "images_captioned": 2,
      "images_skipped": 0,
      "images_errored": 0,
      "prompt_tokens": 1840,
      "completion_tokens": 256
    }
  }
}
```

| Header | Value |
|---|---|
| `X-Input-Size-Bytes` | File size |
| `X-Document-Hash` | Content hash |
| `X-Processing-Time-Ms` | Duration |
| `X-Processing-Pipeline` | Steps taken |
| `X-Billable-Units` | Units billed |
| `X-Images-Captioned` | Images described |
| `Content-Disposition` | `attachment; filename="original.pdf.md"` |

**202** — still processing. Respect `Retry-After`.

**410** — result expired or deleted.

**500** — processing failed. Body contains `detail`.

---

## DELETE /v1/jobs/{job_id}

Immediately delete stored files for a job. Metadata retained for billing audit.

```bash
curl -X DELETE https://apim-canonizr-prod.azure-api.net/v1/jobs/{job_id} \
  -H "Ocp-Apim-Subscription-Key: YOUR_API_KEY"
```

Returns 204 on success, 404 if unknown, 410 if already gone.

---

## GET /health

Returns `{"status": "ok"}`. No auth required.

---

## Status codes

| Code | Meaning |
|---|---|
| 200 | Result ready |
| 202 | Accepted / processing |
| 204 | Deleted |
| 400 | Unsupported file type |
| 401 | Missing or invalid key |
| 404 | Unknown job |
| 410 | Expired or deleted |
| 413 | File too large (50MB) |
| 429 | Rate limit or quota exceeded |
| 500 | Processing error |
| 502 | Upstream error |
| 503 | Service unavailable |
| 504 | Timeout |

---

## Quotas

Per-key quotas are optional. Set via the portal as a monthly byte limit.

When exceeded, the API returns 429 with remaining capacity in the message. Repeated rejections trigger escalating backoff.

Without a quota set, usage is unlimited (billed via Stripe).

---

## Billing

Per 100KB of input file size, rounded up, minimum 1 unit. All formats billed the same.

- Charged on submission (202), not on result retrieval
- Failed jobs refunded automatically
- Deduplicated submissions not charged
- 500 free units/month (50MB) per key
- $0.003/unit beyond free tier

Billing fields in both the 202 response and the 200 result headers.

---

## Supported formats

| Format | Extensions | Pipeline | Time |
|---|---|---|---|
| PDF | .pdf | Docling | 2-15s |
| Word | .docx | MarkItDown | 2-5s |
| PowerPoint | .pptx | MarkItDown | 2-5s |
| Excel | .xlsx | MarkItDown | 2-5s |
| EPUB | .epub | MarkItDown | 2-5s |
| Email | .eml, .msg | MarkItDown | 2-5s |
| HTML | .html | MarkItDown | 2-5s |
| Images | .png, .jpg, .webp, .tiff, .heic | AI captioning | 5-8s |
| Text | .txt, .md, .csv, .json, .xml, code | Passthrough | 1-2s |
| Legacy Office | .doc, .xls, .ppt, .odt, .rtf | Gotenberg → Docling | 30-90s |

---

## Reserved parameters

These are accepted but not yet implemented. Passing them now is safe (ignored).

| Parameter | Type | Future use |
|---|---|---|
| `options` | JSON query param | Processing options (e.g. `{"redact": true}`, `{"output": "json"}`) |
| `webhook` | URL query param | POST result to this URL on completion |
| `retention` | duration query param | Override default 24h retention (e.g. `10m`, `7d`) |

---

## Examples

### curl

```bash
JOB=$(curl -s -X POST https://apim-canonizr-prod.azure-api.net/v1/jobs \
  -H "Ocp-Apim-Subscription-Key: $KEY" \
  -F "file=@doc.pdf" | jq -r .job_id)

while true; do
  R=$(curl -s -w '\n%{http_code}' https://apim-canonizr-prod.azure-api.net/v1/jobs/$JOB \
    -H "Ocp-Apim-Subscription-Key: $KEY")
  CODE=$(echo "$R" | tail -1)
  BODY=$(echo "$R" | sed '$d')
  [ "$CODE" = "200" ] && echo "$BODY" | jq .markdown && break
  [ "$CODE" != "202" ] && echo "Error: $BODY" && break
  sleep 2
done
```

### Python

```python
import requests, time

KEY = "your-key"
BASE = "https://apim-canonizr-prod.azure-api.net"
H = {"Ocp-Apim-Subscription-Key": KEY}

r = requests.post(f"{BASE}/convert", headers=H, files={"file": open("doc.pdf", "rb")})
job = r.json()

while True:
    r = requests.get(f"{BASE}{job['poll_url']}", headers=H)
    if r.status_code == 200:
        print(r.json()["markdown"])
        break
    if r.status_code != 202:
        raise Exception(r.json())
    time.sleep(2)
```

### JavaScript

```javascript
const KEY = "your-key";
const BASE = "https://apim-canonizr-prod.azure-api.net";
const H = { "Ocp-Apim-Subscription-Key": KEY };

const form = new FormData();
form.append("file", file);
const { job_id, poll_url } = await (await fetch(`${BASE}/convert`, {
  method: "POST", headers: H, body: form
})).json();

while (true) {
  const r = await fetch(`${BASE}${poll_url}`, { headers: H });
  if (r.status === 200) return await r.json();
  if (r.status !== 202) throw new Error(await r.text());
  await new Promise(r => setTimeout(r, 2000));
}
```
