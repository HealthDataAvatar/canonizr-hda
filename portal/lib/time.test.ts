import { describe, it, expect } from "vitest";
import { timeAgo } from "./time";

describe("timeAgo", () => {
  function ago(ms: number): string {
    return new Date(Date.now() - ms).toISOString();
  }

  const SECOND = 1000;
  const MINUTE = 60 * SECOND;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;
  const MONTH = 30 * DAY;

  it("returns 'less than a minute ago' for recent timestamps", () => {
    expect(timeAgo(ago(10 * SECOND))).toBe("less than a minute ago");
  });

  it("returns minutes", () => {
    const result = timeAgo(ago(5 * MINUTE));
    expect(result).toBe("5 minutes ago");
  });

  it("returns '1 minute ago'", () => {
    expect(timeAgo(ago(61 * SECOND))).toBe("1 minute ago");
  });

  it("returns hours", () => {
    const result = timeAgo(ago(3 * HOUR));
    expect(result).toBe("about 3 hours ago");
  });

  it("returns days", () => {
    const result = timeAgo(ago(2 * DAY));
    expect(result).toBe("2 days ago");
  });

  it("returns weeks", () => {
    const result = timeAgo(ago(10 * DAY));
    expect(result).toBe("10 days ago");
  });

  it("returns 'about 1 month ago'", () => {
    const result = timeAgo(ago(MONTH + DAY));
    expect(result).toBe("about 1 month ago");
  });

  it("returns months", () => {
    const result = timeAgo(ago(3 * MONTH));
    expect(result).toBe("3 months ago");
  });

  it("accepts Date objects", () => {
    const result = timeAgo(new Date(Date.now() - 5 * MINUTE));
    expect(result).toBe("5 minutes ago");
  });
});
