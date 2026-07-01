# Security sweep — input format attack surfaces

The gateway accepts arbitrary files from untrusted users and processes them through several pipelines. This doc catalogues the attack surface per pipeline and lists priorities for hardening.

## Launch blockers (re-verified 2026-07-01)

Originally three (2026-06-24). Re-verified — only the MarkItDown timeout is still
genuinely open.

1. **Pillow decompression bomb** — ✅ fixed. Explicit `MAX_IMAGE_PIXELS` cap in
   `imageconv/convert.py`; decode errors → `MalformedInput` → 400/permanent (not a
   500). Tests in `test_imageconv.py`.
2. **MarkItDown timeout** — ⚠ **open (stopgap only).** `markitdown.py` bounds the
   job deadline via `asyncio.wait_for` so a bad doc fails cleanly — but the
   executor thread can't be cancelled, so it still burns a core and gives no
   isolation. The real fix is the parse sidecar:
   **`docs/issues/untrusted-parse-isolation.md`** (build after launch).
   *(XXE: LOW — MarkItDown uses `defusedxml`/`xml.etree`, no unsafe `lxml`.)*
3. **Gotenberg non-root** — ✅ non-issue. Upstream `gotenberg/gotenberg:8` already
   runs non-root; original "runs as root" premise was wrong.

**Also done (was a P0):** Gotenberg outbound isolation —
`infra/terraform/gotenberg.tf:58` sets `external_enabled = false` (internal-only).
The unchecked P0 box below is stale.

## Pipeline risk summary

| Pipeline | Runs in | Risk | Key concern |
|---|---|---|---|
| Passthrough | Worker (decode only) | Low | None — no parsing |
| Pillow (images) | Worker process | Low-Medium | Decompression bombs, malformed image CVEs |
| MarkItDown | Worker process (executor) | Medium | XML parsing (XXE), CPU bombs from nested HTML/OOXML |
| Docling (PDF) | Worker process | Medium | PDF parser bugs, malformed streams |
| Gotenberg/LibreOffice | Separate container | Medium-High | Massive CVE surface, but container-isolated |

## Priorities

### P1 — Address soon

- [ ] **Pillow image/* wildcard**: Any `image/*` MIME type is accepted via prefix match. This means formats Pillow can't handle will error (acceptable), but also means untested codec paths are reachable. Consider whether to restrict to an explicit allowlist instead.

### P2 — Track / low urgency

- [ ] **SVG passthrough content**: SVG is passed through as raw XML text. If a downstream consumer renders it in a browser, embedded `<script>`, `onclick`, or `xlink:href` could execute. This is the consumer's responsibility, but we could optionally strip dangerous elements as defence-in-depth.
- [ ] **Email parsing (.eml / .msg)**: `.eml` uses Python's `email` module, `.msg` uses `olefile`. Both are read-only text extraction. Low risk but parsers for legacy formats occasionally have bugs.
- [ ] **EPUB parsing**: ZIP containing XHTML — same XML concerns as MarkItDown OOXML, covered by P1 XML check.

## Future pipelines (not yet implemented)

- **ffmpeg (video + audio)**: Planned for both `video-support.md` and `audio-transcription.md`. ffmpeg is a massive native binary with regular CVEs. It will run in the worker process, parsing untrusted media. Consider running it in a separate container like Gotenberg, or at minimum with resource limits and seccomp filtering.
- **MarkItDown audio**: `audio-transcription.md` already flags that `markitdown[all]` includes `speech_recognition` which sends audio to Google's free speech API with no auth. Must never install `markitdown[all]` — only the base package. If audio extras are ever added, audit what network calls they make.

## Related issue docs

- `bad-jobs.md` — covers known-bad file blocklist (zip bombs, crash-inducing PDFs) and per-key failure rate limiting. The blocklist (section 3) is the operational complement to these structural checks.
- `downsize-images.md` — image downsizing is implemented, partially addresses decompression bomb risk (but after decode, not before).
- `video-support.md` — adds ffmpeg to worker container, new attack surface.
- `audio-transcription.md` — flags MarkItDown audio data exfiltration risk.

## Notes

- The worker processes untrusted input **in-process** for most pipelines. A single worker crash affects only that job (refunded), but repeated exploitation could deny service.
- Container Apps have memory limits — decompression bombs are bounded by the 4GiB worker limit, but an OOM kill still disrupts in-flight jobs.
- Gotenberg is the only pipeline that runs in a separate container. All others (Pillow, MarkItDown, Docling) run in the worker process.
