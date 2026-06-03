/**
 * Trace span tree types matching gateway's Span.to_dict() output.
 * Used by the flamegraph viewer and infra cost estimation.
 */

export interface SpanNode {
  name: string;
  duration_ms?: number;
  attributes?: Record<string, unknown>;
  children?: SpanNode[];
}

/** Flat representation of a span for rendering. */
export interface FlatSpan {
  name: string;
  depth: number;
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
  const rootStart = 0;

  function walk(node: SpanNode, depth: number, parentStartMs: number) {
    const durationMs = node.duration_ms ?? 0;
    result.push({
      name: node.name,
      depth,
      startMs: parentStartMs,
      durationMs,
      attributes: node.attributes ?? {},
    });

    if (node.children) {
      // Children start sequentially within the parent.
      // We don't have absolute timestamps in the tree, so we lay them out
      // based on their durations, filling the parent's time.
      let childOffset = parentStartMs;
      for (const child of node.children) {
        walk(child, depth + 1, childOffset);
        childOffset += child.duration_ms ?? 0;
      }
    }
  }

  walk(root, 0, rootStart);
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
