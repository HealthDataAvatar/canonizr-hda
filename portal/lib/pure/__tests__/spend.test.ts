import { describe, it, expect } from "vitest";
import { dollarsToQuotaKB, usageKBToDollars, quotaKBToDollars } from "@/lib/pure/spend";

describe("dollarsToQuotaKB", () => {
  it("converts $5 at $0.003/unit to 166,600 KB", () => {
    expect(dollarsToQuotaKB(5, 0.003)).toBe(166600);
  });

  it("rounds down to avoid exceeding dollar limit", () => {
    // $1 at $0.003/unit = 333.33 units → 333 × 100 = 33,300 KB
    expect(dollarsToQuotaKB(1, 0.003)).toBe(33300);
  });

  it("returns 0 for $0", () => {
    expect(dollarsToQuotaKB(0, 0.003)).toBe(0);
  });
});

describe("usageKBToDollars", () => {
  it("converts 10,000 KB at $0.003/unit to $0.30", () => {
    expect(usageKBToDollars(10000, 0.003)).toBeCloseTo(0.30);
  });

  it("returns 0 for 0 KB", () => {
    expect(usageKBToDollars(0, 0.003)).toBe(0);
  });
});

describe("quotaKBToDollars", () => {
  it("converts 166,600 KB at $0.003/unit back to ~$5", () => {
    expect(quotaKBToDollars(166600, 0.003)).toBeCloseTo(4.998);
  });
});
