import { describe, it, expect } from "vitest";
import { calculateBilling } from "@/lib/pure/billing-calc";

describe("calculateBilling", () => {
  it("calculates within free tier", () => {
    const result = calculateBilling({ totalUnits: 100, freeUnits: 500, pricePerUnit: 0.003 });
    expect(result.processedKB).toBe(10_000);
    expect(result.freeRemainingKB).toBe(40_000);
    expect(result.freeTotalKB).toBe(50_000);
    expect(result.estimatedCost).toBe(0);
  });

  it("calculates over free tier", () => {
    const result = calculateBilling({ totalUnits: 720, freeUnits: 500, pricePerUnit: 0.003 });
    expect(result.processedKB).toBe(72_000);
    expect(result.freeRemainingKB).toBe(0);
    expect(result.freeTotalKB).toBe(50_000);
    expect(result.estimatedCost).toBeCloseTo(0.66);
  });

  it("handles no free tier (unlimited user)", () => {
    const result = calculateBilling({ totalUnits: 1500, freeUnits: null, pricePerUnit: 0.003 });
    expect(result.processedKB).toBe(150_000);
    expect(result.freeRemainingKB).toBeNull();
    expect(result.freeTotalKB).toBeNull();
    expect(result.estimatedCost).toBeCloseTo(4.50);
  });

  it("handles zero usage", () => {
    const result = calculateBilling({ totalUnits: 0, freeUnits: 500, pricePerUnit: 0.003 });
    expect(result.processedKB).toBe(0);
    expect(result.freeRemainingKB).toBe(50_000);
    expect(result.estimatedCost).toBe(0);
  });

  it("handles exactly at free tier boundary", () => {
    const result = calculateBilling({ totalUnits: 500, freeUnits: 500, pricePerUnit: 0.003 });
    expect(result.freeRemainingKB).toBe(0);
    expect(result.estimatedCost).toBe(0);
  });

  it("respects custom price per unit", () => {
    const result = calculateBilling({ totalUnits: 600, freeUnits: 500, pricePerUnit: 0.01 });
    expect(result.estimatedCost).toBeCloseTo(1.00);
  });
});
