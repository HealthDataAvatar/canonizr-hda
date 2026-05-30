import { formatDistanceToNow } from "date-fns";

/**
 * Format a timestamp as relative time, e.g. "5 minutes ago", "3 months ago".
 * Returns "just now" for anything under 30 seconds.
 */
export function timeAgo(timestamp: string | Date): string {
  return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
}
