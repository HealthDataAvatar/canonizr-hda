/**
 * Format a timestamp as relative time, e.g. "5 minutes ago", "3 months ago".
 * Returns "just now" for anything under 30 seconds.
 */

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "always" });

// [threshold-in-current-unit, unit]; walk up dividing until the duration fits.
const DIVISIONS: [number, Intl.RelativeTimeFormatUnit][] = [
  [60, "second"],
  [60, "minute"],
  [24, "hour"],
  [7, "day"],
  [4.34524, "week"],
  [12, "month"],
  [Number.POSITIVE_INFINITY, "year"],
];

export function timeAgo(timestamp: string | Date): string {
  const date = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
  let duration = (date.getTime() - Date.now()) / 1000; // seconds; negative = past
  if (Math.abs(duration) < 30) return "just now";
  for (const [amount, unit] of DIVISIONS) {
    if (Math.abs(duration) < amount) return rtf.format(Math.round(duration), unit);
    duration /= amount;
  }
  return rtf.format(Math.round(duration), "year");
}
