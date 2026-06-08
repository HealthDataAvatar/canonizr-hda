/** Artefact manifest types matching gateway's ArtefactMeta. */

export interface ArtefactEntry {
  name: string;
  mime_type: string;
  size_bytes: number;
  label: string;
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
