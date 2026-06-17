import { describe, it, expect } from "vitest";
import { timeAgo } from "@/lib/pure/time";

describe("timeAgo", () => {
  function ago(ms: number): string {
    return new Date(Date.now() - ms).toISOString();
  }

  const SECOND = 1000;
  const MINUTE = 60 * SECOND;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;
  const MONTH = 30 * DAY;

  it("returns 'just now' for timestamps under 30 seconds", () => {
    expect(timeAgo(ago(10 * SECOND))).toBe("just now");
  });

  it("returns minutes", () => {
    expect(timeAgo(ago(5 * MINUTE))).toBe("5 minutes ago");
  });

  it("returns '1 minute ago'", () => {
    expect(timeAgo(ago(61 * SECOND))).toBe("1 minute ago");
  });

  it("returns hours", () => {
    expect(timeAgo(ago(3 * HOUR))).toBe("3 hours ago");
  });

  it("returns days", () => {
    expect(timeAgo(ago(2 * DAY))).toBe("2 days ago");
  });

  it("returns weeks", () => {
    expect(timeAgo(ago(10 * DAY))).toBe("1 week ago");
  });

  it("returns months", () => {
    expect(timeAgo(ago(3 * MONTH))).toBe("3 months ago");
  });

  it("accepts Date objects", () => {
    expect(timeAgo(new Date(Date.now() - 5 * MINUTE))).toBe("5 minutes ago");
  });

  it("returns '1 year ago' once over a year", () => {
    expect(timeAgo(ago(400 * DAY))).toBe("1 year ago");
  });

  it("returns 'N years ago' for very old timestamps", () => {
    expect(timeAgo(ago(2 * 365 * DAY))).toMatch(/years ago/);
  });

  it("handles ISO string format", () => {
    expect(timeAgo("2020-01-01T00:00:00Z")).toMatch(/years ago/);
  });
});
