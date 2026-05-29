/** Format a KB value as KB or MB (decimal, not binary). */
export function formatKB(kb: number): string {
  if (kb >= 1000) return `${(kb / 1000).toFixed(kb >= 10000 ? 0 : 1)} MB`;
  return `${kb} KB`;
}

/** Format a byte count as B, KB, or MB (decimal). */
export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1000 * 1000) return `${(bytes / 1000).toFixed(1)} KB`;
  return `${(bytes / (1000 * 1000)).toFixed(1)} MB`;
}

/** Convert raw bytes to billable KB (rounded up to nearest 100 KB, minimum 100 KB). */
export function toBillableKB(bytes: number): number {
  return Math.max(100, Math.ceil(bytes / (100 * 1000)) * 100);
}
