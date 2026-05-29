import { describe, it, expect } from "vitest";
import { formatKB, formatBytes, toBillableKB } from "./format";

describe("formatKB", () => {
  it("formats values under 1000 as KB", () => {
    expect(formatKB(100)).toBe("100 KB");
    expect(formatKB(500)).toBe("500 KB");
    expect(formatKB(999)).toBe("999 KB");
  });

  it("formats 1000+ as MB with one decimal", () => {
    expect(formatKB(1000)).toBe("1.0 MB");
    expect(formatKB(2600)).toBe("2.6 MB");
    expect(formatKB(4200)).toBe("4.2 MB");
  });

  it("formats 10000+ as MB with no decimal", () => {
    expect(formatKB(10000)).toBe("10 MB");
    expect(formatKB(50000)).toBe("50 MB");
  });

  it("handles zero", () => {
    expect(formatKB(0)).toBe("0 KB");
  });
});

describe("formatBytes", () => {
  it("formats values under 1000 as B", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(999)).toBe("999 B");
  });

  it("formats 1000-999999 as KB", () => {
    expect(formatBytes(1000)).toBe("1.0 KB");
    expect(formatBytes(8291)).toBe("8.3 KB");
    expect(formatBytes(127283)).toBe("127.3 KB");
  });

  it("formats 1000000+ as MB", () => {
    expect(formatBytes(1000000)).toBe("1.0 MB");
    expect(formatBytes(2516582)).toBe("2.5 MB");
  });
});

describe("toBillableKB", () => {
  it("rounds up to nearest 100 KB", () => {
    expect(toBillableKB(100001)).toBe(200);
    expect(toBillableKB(200000)).toBe(200);
    expect(toBillableKB(200001)).toBe(300);
  });

  it("minimum is 100 KB", () => {
    expect(toBillableKB(0)).toBe(100);
    expect(toBillableKB(1)).toBe(100);
    expect(toBillableKB(99999)).toBe(100);
  });

  it("handles exact boundaries", () => {
    expect(toBillableKB(100000)).toBe(100);
    expect(toBillableKB(1000000)).toBe(1000);
  });

  it("handles large files", () => {
    expect(toBillableKB(2100000)).toBe(2100);
    expect(toBillableKB(4200000)).toBe(4200);
  });
});
