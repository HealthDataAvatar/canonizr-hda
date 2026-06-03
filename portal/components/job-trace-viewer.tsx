"use client";

import { useState, useCallback, type ChangeEvent } from "react";
import { TraceFlame } from "@/components/trace-flame";
import { TraceCostCard } from "@/components/trace-cost-card";
import type { SpanNode } from "@/lib/pure/trace";

export function JobTraceViewer({ initialTrace, pricePerUnit }: { initialTrace?: string; pricePerUnit?: number }) {
  const [raw, setRaw] = useState(initialTrace ?? "");
  const [trace, setTrace] = useState<SpanNode | null>(() => tryParse(initialTrace));
  const [error, setError] = useState<string | null>(null);

  const handleParse = useCallback(() => {
    const result = tryParse(raw);
    if (result) {
      setTrace(result);
      setError(null);
    } else {
      setError("Invalid trace JSON. Expected a span tree with { name, duration_ms, children? }.");
    }
  }, [raw]);

  const handleFile = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      setRaw(text);
      const result = tryParse(text);
      if (result) {
        setTrace(result);
        setError(null);
      } else {
        setError("Invalid trace JSON in file.");
      }
    };
    reader.readAsText(file);
  }, []);

  return (
    <div className="space-y-6">
      {/* Input */}
      <div className="space-y-3">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium">
            Upload JSON
            <input
              type="file"
              accept=".json,application/json"
              onChange={handleFile}
              className="ml-2 text-sm text-muted-foreground file:mr-2 file:rounded file:border-0 file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-border"
            />
          </label>
          <span className="text-muted-foreground text-sm">or paste below</span>
        </div>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder='{"name": "worker", "duration_ms": 1234, "children": [...]}'
          rows={6}
          className="w-full rounded border border-border bg-surface p-3 font-mono text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <button
          onClick={handleParse}
          className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
        >
          Parse trace
        </button>
        {error && (
          <p className="text-sm text-red-500">{error}</p>
        )}
      </div>

      {/* Visualization */}
      {trace && (
        <div className="space-y-6">
          <TraceFlame trace={trace} />
          {pricePerUnit != null && <TraceCostCard trace={trace} pricePerUnit={pricePerUnit} />}
        </div>
      )}
    </div>
  );
}

function tryParse(raw?: string | null): SpanNode | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && "name" in parsed) {
      return parsed as SpanNode;
    }
    return null;
  } catch {
    return null;
  }
}
