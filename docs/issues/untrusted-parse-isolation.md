# Untrusted-parse isolation — a generic sandbox sidecar

## Status: designed, build after launch (a launch stopgap is in place)

## The problem

The worker parses untrusted user bytes **in-process** for most pipelines:

| Pipeline | Runs in | Isolation today |
|---|---|---|
| MarkItDown (OOXML/HTML) | worker process | none (in-process) |
| Docling (PDF) | worker process | none (in-process) |
| Pillow (images) | worker process | none (in-process; pixel cap only) |
| ffmpeg (audio/video, future) | worker process (planned) | none |
| **Gotenberg/LibreOffice** | **separate container** | **✓ non-root, no egress, HTTP** |

Gotenberg is the outlier — and it's the *right* pattern. Everything else shares
the worker's kernel, filesystem, network namespace, secrets, and user. rlimits
bound a *bomb*; they do nothing against an *exploit* — a malicious `.docx`/PDF/
media that achieves RCE in the parser sees the worker's Azure metadata endpoint,
mounted Key Vault secrets, and Redis. This is the real exposure, and it grows
with every new format (ffmpeg especially — huge native CVE surface).

## Why not the obvious quick fixes (learned the hard way, 2026-07-01)

- **In-process + `asyncio.wait_for`** — can't cancel a `run_in_executor` thread;
  the thread keeps burning a core after the coroutine returns. Bounds job
  latency, not worker CPU. (This is the current **stopgap** — see below.)
- **`multiprocessing` subprocess per call** — attempted and reverted. Under
  `uv run` inside an asyncio worker, `spawn` hung (interpreter re-exec fragility)
  and integration tests timed out. Even when it works, a subprocess shares the
  kernel/network/FS/user — it's not real isolation, just a killable bomb-bound.
  rlimits (`RLIMIT_AS/CPU/NOFILE`) are also platform-fragile (`RLIMIT_AS`
  unsupported on macOS dev boxes).

The lesson: **don't try to get container-grade isolation from a process
primitive.** Isolate at the container boundary, like Gotenberg already does.

## Industry practice

Doc/media-processing services (Reducto, Unstructured, LlamaParse) isolate
untrusted parsing in **disposable, network-denied, non-root compute reached over
a network boundary** — tier 3/4 below. The tiers:

1. In-process + rlimits — ~no isolation. (Today, minus rlimits.)
2. Subprocess + rlimits + kill — weak (shared kernel/FS/net/user).
3. **Sidecar sandbox service** — separate container: no outbound network,
   non-root, cgroup mem/CPU caps, read-only FS, called over HTTP/gRPC.
   **← Gotenberg is already this. Standardize on it.**
4. Per-job microVM/gVisor (Firecracker, gVisor, Kata) — strongest, heaviest.
   Revisit only for adversarial multitenant scale.

## Decision: a generic "parse sidecar" (tier 3)

**Decided:** extend the Gotenberg pattern into one hardened container that runs
*all* untrusted parsers, reached over HTTP with the job deadline. One mechanism
for MarkItDown now, Docling and ffmpeg later. Build post-launch; a stopgap holds
the line for launch.

### Shape

```
worker ──HTTP POST /extract (bytes + type + deadline)──▶ parse-sidecar
                                                          ├ MarkItDown
                                                          ├ Docling
                                                          └ ffmpeg (future)
        ◀────────── markdown / artefacts / structured error ──────────
```

- **Sidecar container hardening** (mirror `infra/terraform/gotenberg.tf`):
  - `external_enabled = false` — no outbound network (an exploit can't exfil or
    reach the metadata endpoint / internal services).
  - non-root user (upstream or explicit).
  - cgroup memory + CPU limits (Container App resource caps) — a bomb OOM-kills
    only the sidecar replica, not the worker.
  - read-only root FS + a small tmpfs scratch if a parser needs disk.
  - no secrets / storage credentials mounted — it only ever sees the bytes the
    worker hands it.
- **Timeout = HTTP deadline** (worker passes `deadline`, same as `to_pdf` does
  for Gotenberg today) **+ the sidecar's own request timeout + cgroup kill +
  replica restart.** No un-cancellable-thread problem — killing is the platform's
  job.
- **Interface:** reuse the existing extractor protocols. `MarkItDownExtractor`,
  `DoclingExtractor`, etc. become thin HTTP clients (like `OleConverter` →
  Gotenberg). The `canonize()` pipeline is unchanged; only the extractor impls
  swap from in-process to HTTP.

### Migration order

1. Build the sidecar container + terraform/compose wiring (copy Gotenberg's).
2. Move **MarkItDown** first (it's the open blocker and simplest).
3. Then **Docling** (PDF — second-biggest surface).
4. Then **ffmpeg** when audio/video lands (`video-support.md`,
   `audio-transcription.md`) — it should *never* ship in-process.
5. Consider moving Pillow too, or leave it (lowest risk, has the pixel cap).

### Open questions

- **One sidecar or one per parser?** One container with all parsers is simpler
  ops; separate containers give finer blast-radius/scaling control. Lean: one to
  start, split if a parser's resource profile demands it.
- **Transport for large files / artefacts:** HTTP body vs shared blob reference.
  Gotenberg takes the bytes directly; Docling produces images/thumbnails that may
  be large — consider passing a blob ref rather than inlining. Decide per parser.
- **Sync HTTP vs a second queue:** Gotenberg is sync request/response. For long
  media (ffmpeg on a big video) a queue may fit better. Start sync, revisit for
  video.

## Launch stopgap (in place 2026-07-01)

`gateway/app/services/markitdown.py` enforces the job deadline with
`asyncio.wait_for` and raises `MalformedInput` (400/permanent) on timeout, so a
slow/malicious doc fails cleanly instead of wedging the job forever.

**This is explicitly NOT the fix.** The executor thread can't be cancelled, so a
crafted doc still burns one core until it finishes or the container's memory
limit recycles the worker. It bounds *job latency*, not *worker CPU*, and gives
*zero* isolation against an exploit. It buys launch; the sidecar is the real
answer. The deadline is already threaded through `extract_ooxml(doc, deadline,
…)` → `extract(doc, deadline)`, so moving to the sidecar needs no further
plumbing of the deadline.

## Related

- `security-sweep.md` — §2 (MarkItDown) points here; the XXE note is subsumed
  (the sidecar bounds XXE blast radius too). ffmpeg + Docling rows there are the
  future migrations.
- `video-support.md` / `audio-transcription.md` — ffmpeg must land on the sidecar,
  not in-process.
- Gotenberg (`infra/terraform/gotenberg.tf`) — the working reference
  implementation of this pattern; copy its hardening.
