import { describe, it, expect } from "vitest";
import { sumUsageSince, sumInvoiceAmounts } from "./pure/admin-calc";

describe("sumUsageSince", () => {
  const now = Date.now();
  const HOUR = 3_600_000;
  const DAY = 24 * HOUR;

  it("sums jobs within the window", () => {
    const jobs = [
      { timestamp: new Date(now - 1 * DAY).toISOString(), billableKB: 100 },
      { timestamp: new Date(now - 3 * DAY).toISOString(), billableKB: 200 },
      { timestamp: new Date(now - 6 * DAY).toISOString(), billableKB: 300 },
    ];
    expect(sumUsageSince(jobs, now - 7 * DAY)).toBe(600);
  });

  it("excludes jobs outside the window", () => {
    const jobs = [
      { timestamp: new Date(now - 1 * DAY).toISOString(), billableKB: 100 },
      { timestamp: new Date(now - 8 * DAY).toISOString(), billableKB: 500 },
      { timestamp: new Date(now - 30 * DAY).toISOString(), billableKB: 900 },
    ];
    expect(sumUsageSince(jobs, now - 7 * DAY)).toBe(100);
  });

  it("returns 0 for empty jobs", () => {
    expect(sumUsageSince([], now - 7 * DAY)).toBe(0);
  });

  it("returns 0 when all jobs are older than the window", () => {
    const jobs = [
      { timestamp: new Date(now - 10 * DAY).toISOString(), billableKB: 100 },
    ];
    expect(sumUsageSince(jobs, now - 7 * DAY)).toBe(0);
  });

  it("includes jobs exactly at the boundary", () => {
    const boundary = now - 7 * DAY;
    const jobs = [
      { timestamp: new Date(boundary).toISOString(), billableKB: 50 },
    ];
    expect(sumUsageSince(jobs, boundary)).toBe(50);
  });
});

describe("sumInvoiceAmounts", () => {
  it("sums all invoice amounts", () => {
    const invoices = [
      { amount: 1.50 },
      { amount: 2.34 },
      { amount: 0.66 },
    ];
    expect(sumInvoiceAmounts(invoices)).toBeCloseTo(4.50);
  });

  it("returns 0 for empty invoices", () => {
    expect(sumInvoiceAmounts([])).toBe(0);
  });

  it("handles a single invoice", () => {
    expect(sumInvoiceAmounts([{ amount: 3.00 }])).toBe(3.00);
  });

  it("handles zero-amount invoices", () => {
    const invoices = [
      { amount: 0 },
      { amount: 1.47 },
      { amount: 0 },
    ];
    expect(sumInvoiceAmounts(invoices)).toBeCloseTo(1.47);
  });
});
