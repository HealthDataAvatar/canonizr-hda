import { describe, it, expect } from "vitest";
import { estimateInfraCost } from "@/lib/pure/infra-cost";
import type { SpanNode } from "@/lib/pure/trace";

const TRACE_WITH_CAPTIONING: SpanNode = {
  name: "worker",
  duration_ms: 5000,
  children: [
    { name: "docling", duration_ms: 4000, attributes: {} },
    {
      name: "captioning",
      duration_ms: 1000,
      attributes: { prompt_tokens: 1000, completion_tokens: 500 },
    },
  ],
};

const TRACE_SIMPLE: SpanNode = {
  name: "worker",
  duration_ms: 2000,
  children: [
    { name: "passthrough", duration_ms: 50, attributes: {} },
  ],
};

describe("estimateInfraCost", () => {
  it("computes costs for a trace with captioning", () => {
    const est = estimateInfraCost(TRACE_WITH_CAPTIONING);
    expect(est.totalDurationMs).toBe(5000);
    expect(est.totalPromptTokens).toBe(1000);
    expect(est.totalCompletionTokens).toBe(500);
    expect(est.totalCost).toBeGreaterThan(0);

    // Worker: 5s * 2 vCPU * $0.000024/vCPU-s = $0.000240
    const worker = est.breakdown.find((b) => b.service === "worker")!;
    expect(worker).toBeDefined();
    expect(worker.computeCost).toBeCloseTo(0.000240, 6);

    // Docling (external container): 4s * 2 vCPU * $0.000024 = $0.000192
    const docling = est.breakdown.find((b) => b.service === "docling")!;
    expect(docling.computeCost).toBeCloseTo(0.000192, 6);
    expect(docling.tokenCost).toBe(0);

    // Captioning: no compute (runs inside worker), only token cost
    const cap = est.breakdown.find((b) => b.service === "captioning (tokens)")!;
    expect(cap.computeCost).toBe(0);
    expect(cap.tokenCost).toBeCloseTo(0.0125, 4); // (1000/1000)*0.005 + (500/1000)*0.015
  });

  it("handles simple passthrough trace", () => {
    const est = estimateInfraCost(TRACE_SIMPLE);
    // worker + no external services
    const worker = est.breakdown.find((b) => b.service === "worker")!;
    expect(worker).toBeDefined();
    expect(est.totalPromptTokens).toBe(0);
    expect(est.totalCost).toBeGreaterThan(0);
    expect(est.totalCost).toBeLessThan(0.001);
  });

  it("includes worker cost even with no recognized services", () => {
    const est = estimateInfraCost({ name: "worker", duration_ms: 1000 });
    expect(est.breakdown).toHaveLength(1);
    expect(est.breakdown[0].service).toBe("worker");
    expect(est.totalCost).toBeGreaterThan(0);
  });
});
