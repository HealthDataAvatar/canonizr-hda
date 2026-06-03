import { describe, it, expect } from "vitest";
import { flattenSpans, totalDurationMs, collectServices, colorForService } from "@/lib/pure/trace";
import type { SpanNode } from "@/lib/pure/trace";

const SIMPLE_TRACE: SpanNode = {
  name: "worker",
  duration_ms: 5000,
  attributes: { file_size_bytes: 102400 },
  children: [
    {
      name: "docling",
      duration_ms: 4200,
      attributes: {},
    },
    {
      name: "captioning",
      duration_ms: 800,
      attributes: { prompt_tokens: 500, completion_tokens: 200, images_captioned: 2 },
      children: [
        { name: "page[0]", duration_ms: 400, attributes: {} },
        { name: "page[1]", duration_ms: 400, attributes: {} },
      ],
    },
  ],
};

const NESTED_TRACE: SpanNode = {
  name: "worker",
  duration_ms: 8000,
  children: [
    {
      name: "gotenberg",
      duration_ms: 2000,
      attributes: {},
    },
    {
      name: "docling",
      duration_ms: 3000,
      attributes: {},
    },
    {
      name: "captioning",
      duration_ms: 3000,
      attributes: { prompt_tokens: 1000, completion_tokens: 500 },
      children: [
        {
          name: "extract_pages",
          duration_ms: 500,
          attributes: {},
        },
        { name: "page[0]", duration_ms: 1200, attributes: {} },
        { name: "page[1]", duration_ms: 1300, attributes: {} },
      ],
    },
  ],
};

describe("flattenSpans", () => {
  it("flattens a simple trace into ordered spans", () => {
    const flat = flattenSpans(SIMPLE_TRACE);
    expect(flat.length).toBe(5); // worker + docling + captioning + page[0] + page[1]
    expect(flat[0].name).toBe("worker");
    expect(flat[0].depth).toBe(0);
    expect(flat[0].startMs).toBe(0);
    expect(flat[1].name).toBe("docling");
    expect(flat[1].depth).toBe(1);
    expect(flat[1].startMs).toBe(0);
    expect(flat[2].name).toBe("captioning");
    expect(flat[2].depth).toBe(1);
    expect(flat[2].startMs).toBe(4200);
  });

  it("nests children correctly", () => {
    const flat = flattenSpans(SIMPLE_TRACE);
    const page0 = flat.find((s) => s.name === "page[0]");
    expect(page0).toBeDefined();
    expect(page0!.depth).toBe(2);
    expect(page0!.startMs).toBe(4200); // starts at captioning's start
  });

  it("handles deeply nested traces", () => {
    const flat = flattenSpans(NESTED_TRACE);
    expect(flat.length).toBe(7);
    const extractPages = flat.find((s) => s.name === "extract_pages");
    expect(extractPages).toBeDefined();
    expect(extractPages!.depth).toBe(2);
  });
});

describe("totalDurationMs", () => {
  it("returns root duration", () => {
    expect(totalDurationMs(SIMPLE_TRACE)).toBe(5000);
  });

  it("returns 0 for missing duration", () => {
    expect(totalDurationMs({ name: "empty" })).toBe(0);
  });
});

describe("collectServices", () => {
  it("collects known service names", () => {
    const services = collectServices(SIMPLE_TRACE);
    expect(services).toContain("docling");
    expect(services).toContain("captioning");
    expect(services).not.toContain("worker");
    expect(services).not.toContain("page[0]");
  });

  it("collects all services from nested trace", () => {
    const services = collectServices(NESTED_TRACE);
    expect(services).toEqual(["captioning", "docling", "extract_pages", "gotenberg"]);
  });
});

describe("colorForService", () => {
  it("returns a color for known services", () => {
    expect(colorForService("docling")).toContain("oklch");
  });

  it("returns default color for unknown names", () => {
    expect(colorForService("unknown")).toContain("default");
  });
});
