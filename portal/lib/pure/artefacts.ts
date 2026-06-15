/** Artefact manifest types matching gateway's ArtefactMeta. */

export interface ArtefactEntry {
  name: string;
  mime_type: string;
  size_bytes: number;
  label?: string;
  source_page?: number;
}

export function parseArtefacts(raw?: string): ArtefactEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Derive a human-readable display label from manifest data. */
export function displayLabel(entry: ArtefactEntry): string {
  if (entry.label) {
    return entry.source_page ? `${entry.label} (page ${entry.source_page})` : entry.label;
  }
  // Derive from name: "page-1" → "Page 1", "table-3" → "Table 3"
  const base = entry.name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return entry.source_page ? `${base} (page ${entry.source_page})` : base;
}
