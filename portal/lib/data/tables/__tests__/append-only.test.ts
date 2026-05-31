import { describe, it, expect } from "vitest";
import { invertedTimestampRK } from "@/lib/data/tables/append-only";

describe("invertedTimestampRK", () => {
  it("produces a string with inverted timestamp prefix", () => {
    const rk = invertedTimestampRK();
    const parts = rk.split("_");
    expect(parts.length).toBe(2);
    expect(parts[0].length).toBe(13);
    expect(parts[1].length).toBe(8);
  });

  it("newer timestamps produce smaller (earlier-sorting) RKs", () => {
    const rk1 = invertedTimestampRK();
    // Simulate a later timestamp
    const later = String(9_999_999_999_999 - (Date.now() + 1000)).padStart(13, "0");
    expect(later < rk1.split("_")[0]).toBe(true);
  });

  it("produces unique values", () => {
    const rks = new Set(Array.from({ length: 100 }, () => invertedTimestampRK()));
    expect(rks.size).toBe(100);
  });
});
