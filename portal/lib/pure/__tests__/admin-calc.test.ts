import { describe, it, expect } from "vitest";
import { aggregateJobs, sumInvoiceAmounts } from "@/lib/pure/admin-calc";

describe("aggregateJobs", () => {
  const now = Date.now();
  const HOUR = 3_600_000;
  const DAY = 24 * HOUR;

  function job(daysAgo: number, inputBytes: number, status = "ok") {
    return {
      timestamp: new Date(now - daysAgo * DAY).toISOString(),
      inputBytes,
      status,
    };
  }

  it("counts and sums billable KB for jobs within window", () => {
    const jobs = [job(1, 150_000), job(3, 250_000), job(6, 350_000)];
    const stats = aggregateJobs(jobs, now - 7 * DAY);
    expect(stats.count).toBe(3);
    expect(stats.billableKB).toBe(200 + 300 + 400); // toBillableKB rounds up to nearest 100KB
  });

  it("excludes jobs outside the window", () => {
    const jobs = [job(1, 100_000), job(8, 500_000), job(30, 900_000)];
    const stats = aggregateJobs(jobs, now - 7 * DAY);
    expect(stats.count).toBe(1);
    expect(stats.billableKB).toBe(100);
  });

  it("counts errors", () => {
    const jobs = [job(1, 100_000, "ok"), job(2, 100_000, "error"), job(3, 100_000, "error")];
    const stats = aggregateJobs(jobs, now - 7 * DAY);
    expect(stats.count).toBe(3);
    expect(stats.errorCount).toBe(2);
  });

  it("returns zeros for empty jobs", () => {
    const stats = aggregateJobs([], now - 7 * DAY);
    expect(stats.count).toBe(0);
    expect(stats.errorCount).toBe(0);
    expect(stats.billableKB).toBe(0);
  });

  it("returns zeros when all jobs are older than window", () => {
    const jobs = [job(10, 100_000)];
    const stats = aggregateJobs(jobs, now - 7 * DAY);
    expect(stats.count).toBe(0);
    expect(stats.billableKB).toBe(0);
  });

  it("includes jobs exactly at boundary", () => {
    const boundary = now - 7 * DAY;
    const jobs = [{ timestamp: new Date(boundary).toISOString(), inputBytes: 50_000, status: "ok" }];
    const stats = aggregateJobs(jobs, boundary);
    expect(stats.count).toBe(1);
    expect(stats.billableKB).toBe(100); // minimum 100KB
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
