/**
 * Trace span tree types matching gateway's Span.to_dict() output.
 * Used by the flamegraph viewer and infra cost estimation.
 */

export interface SpanNode {
  name: string;
  offset_ms?: number;
  duration_ms?: number;
  attributes?: Record<string, unknown>;
  children?: SpanNode[];
}

/** Flat representation of a span for rendering. */
export interface FlatSpan {
  name: string;
  depth: number;
  row: number;
  startMs: number;
  durationMs: number;
  attributes: Record<string, unknown>;
}

/** Known pipeline services — used for coloring. */
const SERVICE_COLORS: Record<string, string> = {
  docling: "var(--color-trace-docling, oklch(0.65 0.15 250))",
  gotenberg: "var(--color-trace-gotenberg, oklch(0.65 0.15 150))",
  captioning: "var(--color-trace-captioning, oklch(0.65 0.19 45))",
  markitdown: "var(--color-trace-markitdown, oklch(0.65 0.15 300))",
  passthrough: "var(--color-trace-passthrough, oklch(0.70 0.05 45))",
  extract_pages: "var(--color-trace-extract-pages, oklch(0.65 0.12 200))",
  libreoffice: "var(--color-trace-libreoffice, oklch(0.65 0.15 100))",
  thumbnails: "var(--color-trace-thumbnails, oklch(0.65 0.12 180))",
  artefacts: "var(--color-trace-artefacts, oklch(0.65 0.10 90))",
};

const DEFAULT_COLOR = "var(--color-trace-default, oklch(0.55 0.05 45))";

export function colorForService(name: string): string {
  return SERVICE_COLORS[name] ?? DEFAULT_COLOR;
}

/**
 * Flatten a span tree into an array of FlatSpan for rendering.
 * Computes start offsets relative to the root span.
 */
export function flattenSpans(root: SpanNode): FlatSpan[] {
  const result: FlatSpan[] = [];
  // Track end times per row to detect overlaps and assign new rows.
  const rowEnds: number[] = [];

  function assignRow(startMs: number, durationMs: number, minRow: number): number {
    const endMs = startMs + durationMs;
    for (let r = minRow; r < rowEnds.length; r++) {
      if (rowEnds[r] <= startMs) {
        rowEnds[r] = endMs;
        return r;
      }
    }
    rowEnds.push(endMs);
    return rowEnds.length - 1;
  }

  function walk(node: SpanNode, minRow: number) {
    const startMs = node.offset_ms ?? 0;
    const durationMs = node.duration_ms ?? 0;
    const row = assignRow(startMs, durationMs, minRow);
    result.push({
      name: node.name,
      depth: minRow,
      row,
      startMs,
      durationMs,
      attributes: node.attributes ?? {},
    });

    // Children must go on rows after this one.
    node.children?.forEach((child) => walk(child, row + 1));
  }

  walk(root, 0);
  return result;
}

/** Total duration of the root span in ms. */
export function totalDurationMs(root: SpanNode): number {
  return root.duration_ms ?? 0;
}

/** Collect all unique service names from the tree. */
export function collectServices(root: SpanNode): string[] {
  const services = new Set<string>();
  function walk(node: SpanNode) {
    if (SERVICE_COLORS[node.name]) services.add(node.name);
    node.children?.forEach(walk);
  }
  walk(root);
  return [...services].sort();
}
