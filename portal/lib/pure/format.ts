/** Format a KB value as KB or MB (decimal, not binary). */
export function formatKB(kb: number): string {
  if (kb == Number.MAX_VALUE) return "inf";
  if (kb >= 1000) return `${(kb / 1000).toFixed(kb >= 10000 ? 0 : 1)} MB`;
  return `${kb} KB`;
}

/** Format a number as USD currency (e.g. 5.1 -> "$5.10"). */
export function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/** Format a millisecond duration as "1.23s" (≥1s) or "456ms". */
export function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${Math.round(ms)}ms`;
}

/** Convert raw bytes to billable KB (rounded up to nearest 100 KB, minimum 100 KB). */
export function toBillableKB(bytes: number): number {
  return Math.max(100, Math.ceil(bytes / (100 * 1000)) * 100);
}
