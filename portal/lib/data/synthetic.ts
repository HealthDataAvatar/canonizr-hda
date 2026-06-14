/** Synthetic table data for stories and tests.
 *
 * Generates coherent sets of JobRecords for a single user with two keys,
 * covering all job states. Uses a seeded PRNG for deterministic output.
 *
 * Stories and tests pass these through `toCanonizeJobRow()` — same path
 * as production — so the synthetic data exercises the real mapping.
 */

import type { ArtefactEntry } from "@/lib/pure/artefacts";
import type { JobRecord } from "./table-interface";

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32) — deterministic, no crypto dependency
// ---------------------------------------------------------------------------

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Realistic file corpus
// ---------------------------------------------------------------------------

const FILES = [
  { name: "annual-report-2025.pdf", mime: "application/pdf", bytes: 2_150_400 },
  { name: "invoice-march.docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes: 204_800 },
  { name: "scan-001.png", mime: "image/png", bytes: 98_304 },
  { name: "memo.txt", mime: "text/plain", bytes: 12_288 },
  { name: "presentation.pptx", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", bytes: 102_400 },
  { name: "spreadsheet.xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bytes: 76_800 },
  { name: "receipt.jpg", mime: "image/jpeg", bytes: 85_000 },
  { name: "contract-draft-v3.pdf", mime: "application/pdf", bytes: 2_662_400 },
  { name: "huge-manual.pdf", mime: "application/pdf", bytes: 4_300_800 },
  { name: "old-report.doc", mime: "application/msword", bytes: 1_024_000 },
] as const;

const ERROR_MESSAGES = [
  "Processing timeout after 120s",
  "Unsupported file type: application/x-executable",
  "Docling extraction failed: corrupt PDF structure",
  "Upstream service unavailable (502)",
  "Rate limit exceeded. Try again in 60 seconds.",
];

// ---------------------------------------------------------------------------
// Artefact manifests
// ---------------------------------------------------------------------------

function pdfArtefacts(pageCount: number, imageCount: number, tableCount: number): ArtefactEntry[] {
  const entries: ArtefactEntry[] = [
    { name: "markdown", mime_type: "text/markdown", size_bytes: 8_420, label: "Extracted text" },
  ];
  for (let i = 0; i < pageCount; i++) {
    entries.push({ name: `page-${i}`, mime_type: "image/png", size_bytes: 140_000 + i * 2_000, label: `Page ${i + 1}` });
    entries.push({ name: `preview-${i}`, mime_type: "image/webp", size_bytes: 8_000 + i * 500, label: `Page ${i + 1}` });
  }
  for (let i = 0; i < imageCount; i++) {
    entries.push({ name: `image-${i}`, mime_type: "image/png", size_bytes: 50_000 + i * 4_000, label: i === 0 ? "Figure" : "Chart" });
  }
  for (let i = 0; i < tableCount; i++) {
    entries.push({ name: `table-${i}`, mime_type: "application/json", size_bytes: 2_000 + i * 800, label: `Table from page ${i + 2}` });
  }
  return entries;
}

function imageArtefact(): ArtefactEntry[] {
  return [{ name: "image-1", mime_type: "image/png", size_bytes: 95_000, label: "Normalised image" }];
}

function textArtefact(): ArtefactEntry[] {
  return [{ name: "markdown", mime_type: "text/markdown", size_bytes: 1_200, label: "Extracted text" }];
}

function artefactsForFile(mime: string, rand: () => number): string {
  if (mime === "application/pdf" || mime === "application/msword") {
    const pages = Math.floor(rand() * 8) + 1;
    const images = Math.floor(rand() * 4);
    const tables = Math.floor(rand() * 3);
    return JSON.stringify(pdfArtefacts(pages, images, tables));
  }
  if (mime.startsWith("image/")) return JSON.stringify(imageArtefact());
  return JSON.stringify(textArtefact());
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface SyntheticConfig {
  /** PRNG seed. Same seed = same data. Default: 42 */
  seed?: number;
  /** Number of jobs to generate. Default: 15 */
  count?: number;
  /** Base time (epoch ms) for "now". Default: Date.now() */
  now?: number;
  /** Key IDs to alternate between. Default: two keys */
  keys?: { id: string; name: string }[];
}

const DEFAULT_KEYS = [
  { id: "key-aaa", name: "agent-bold-crane" },
  { id: "key-bbb", name: "agent-quiet-raven" },
];

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export interface SyntheticUser {
  jobs: JobRecord[];
  keys: { id: string; name: string }[];
}

export function generateSyntheticUser(config: SyntheticConfig = {}): SyntheticUser {
  const {
    seed = 42,
    count = 15,
    now = Date.now(),
    keys = DEFAULT_KEYS,
  } = config;

  const rand = mulberry32(seed);
  const MINUTE = 60_000;
  const HOUR = 60 * MINUTE;

  const jobs: JobRecord[] = [];

  for (let i = 0; i < count; i++) {
    // Spread jobs across time — most recent first, increasing gaps
    const age = i * 25 * MINUTE + rand() * 20 * MINUTE;
    const submittedAt = new Date(now - age);
    const file = FILES[Math.floor(rand() * FILES.length)];
    const key = keys[Math.floor(rand() * keys.length)];
    const id = `job-${String(i).padStart(3, "0")}`;

    // Status distribution: ~60% ok, ~10% processing, ~15% error, ~10% expired, ~5% deleted
    const roll = rand();
    let status: JobRecord["status"];
    if (roll < 0.10) status = "processing";
    else if (roll < 0.25) status = "error";
    else if (roll < 0.35) status = "deleted";
    else status = "ok";

    // Processing time: 1–30 seconds
    const processingMs = (1 + rand() * 29) * 1000;
    const completedAt = status !== "processing"
      ? new Date(submittedAt.getTime() + processingMs)
      : undefined;

    // Retention: 24h from completion. Jobs older than 24h that completed are expired.
    const retentionExpires = completedAt
      ? new Date(completedAt.getTime() + 24 * HOUR)
      : undefined;

    // If retention has passed and status was ok, flip to show expired state naturally
    const effectiveStatus: JobRecord["status"] =
      status === "ok" && retentionExpires && retentionExpires.getTime() < now
        ? "ok" // keep as "ok" — the mapper handles expiry via retentionExpires
        : status;

    const job: JobRecord = {
      id,
      timestamp: submittedAt.toISOString(),
      keyId: key.id,
      jobType: "canonize",
      billableKB: Math.max(100, Math.ceil(file.bytes / (100 * 1000)) * 100),
      inputBytes: file.bytes,
      status: effectiveStatus,
      originalFilename: file.name,
      mimeType: file.mime,
      pricePerUnit: 0.003,
    };

    if (completedAt) {
      job.completedAt = completedAt.toISOString();
    }

    if (retentionExpires) {
      job.retentionExpires = retentionExpires.toISOString();
    }

    if (effectiveStatus === "ok" && retentionExpires && retentionExpires.getTime() >= now) {
      job.artefacts = artefactsForFile(file.mime, rand);
    }

    if (effectiveStatus === "error") {
      job.detail = ERROR_MESSAGES[Math.floor(rand() * ERROR_MESSAGES.length)];
    }

    jobs.push(job);
  }

  return { jobs, keys };
}
