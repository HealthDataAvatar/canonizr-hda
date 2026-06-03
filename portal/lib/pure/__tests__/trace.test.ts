import { describe, it, expect } from "vitest";
import { flattenSpans, totalDurationMs, collectServices, colorForService } from "@/lib/pure/trace";
import type { SpanNode } from "@/lib/pure/trace";

const SIMPLE_TRACE: SpanNode = {
  name: "worker",
  offset_ms: 0,
  duration_ms: 5000,
  attributes: { file_size_bytes: 102400 },
  children: [
    {
      name: "docling",
      offset_ms: 0,
      duration_ms: 4200,
      attributes: {},
    },
    {
      name: "captioning",
      offset_ms: 4200,
      duration_ms: 800,
      attributes: { prompt_tokens: 500, completion_tokens: 200, images_captioned: 2 },
      children: [
        { name: "page[0]", offset_ms: 4200, duration_ms: 400, attributes: {} },
        { name: "page[1]", offset_ms: 4200, duration_ms: 400, attributes: {} },
      ],
    },
  ],
};

const CONCURRENT_TRACE: SpanNode = {
  name: "worker",
  offset_ms: 0,
  duration_ms: 8000,
  children: [
    { name: "docling", offset_ms: 0, duration_ms: 5000, attributes: {} },
    {
      name: "captioning",
      offset_ms: 5000,
      duration_ms: 3000,
      attributes: { prompt_tokens: 1000, completion_tokens: 500 },
      children: [
        { name: "caption_image[0]", offset_ms: 5000, duration_ms: 2000, attributes: {} },
        { name: "caption_image[1]", offset_ms: 5100, duration_ms: 2200, attributes: {} },
        { name: "caption_image[2]", offset_ms: 5200, duration_ms: 2500, attributes: {} },
      ],
    },
  ],
};

const NESTED_TRACE: SpanNode = {
  name: "worker",
  offset_ms: 0,
  duration_ms: 8000,
  children: [
    { name: "gotenberg", offset_ms: 0, duration_ms: 2000, attributes: {} },
    { name: "docling", offset_ms: 2000, duration_ms: 3000, attributes: {} },
    {
      name: "captioning",
      offset_ms: 5000,
      duration_ms: 3000,
      attributes: { prompt_tokens: 1000, completion_tokens: 500 },
      children: [
        { name: "extract_pages", offset_ms: 5000, duration_ms: 500, attributes: {} },
        { name: "page[0]", offset_ms: 5500, duration_ms: 1200, attributes: {} },
        { name: "page[1]", offset_ms: 5500, duration_ms: 1300, attributes: {} },
      ],
    },
  ],
};

describe("flattenSpans", () => {
  it("flattens a simple trace using offset_ms", () => {
    const flat = flattenSpans(SIMPLE_TRACE);
    expect(flat.length).toBe(5);
    expect(flat[0]).toMatchObject({ name: "worker", depth: 0, startMs: 0 });
    expect(flat[1]).toMatchObject({ name: "docling", depth: 1, startMs: 0 });
    expect(flat[2]).toMatchObject({ name: "captioning", depth: 1, startMs: 4200 });
  });

  it("assigns separate rows to overlapping children", () => {
    const flat = flattenSpans(CONCURRENT_TRACE);
    const img0 = flat.find((s) => s.name === "caption_image[0]")!;
    const img1 = flat.find((s) => s.name === "caption_image[1]")!;
    const img2 = flat.find((s) => s.name === "caption_image[2]")!;
    // Correct start positions
    expect(img0.startMs).toBe(5000);
    expect(img1.startMs).toBe(5100);
    expect(img2.startMs).toBe(5200);
    // Same logical depth but different visual rows (they overlap)
    expect(img0.depth).toBe(2);
    expect(img1.depth).toBe(2);
    expect(img2.depth).toBe(2);
    const rows = new Set([img0.row, img1.row, img2.row]);
    expect(rows.size).toBe(3); // each on its own row
  });

  it("handles deeply nested traces", () => {
    const flat = flattenSpans(NESTED_TRACE);
    expect(flat.length).toBe(7);
    const extractPages = flat.find((s) => s.name === "extract_pages")!;
    expect(extractPages.depth).toBe(2);
    expect(extractPages.startMs).toBe(5000);
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
