"use client";

import { useState, useCallback, type ChangeEvent } from "react";
import { TraceFlame } from "@/components/trace-flame";
import { TraceCostCard } from "@/components/trace-cost-card";
import type { SpanNode } from "@/lib/pure/trace";

export function JobTraceViewer({
  initialTrace,
  pricePerUnit,
  onFetchTrace,
}: {
  initialTrace?: string;
  pricePerUnit?: number;
  onFetchTrace?: (jobId: string) => Promise<string | null>;
}) {
  const [raw, setRaw] = useState(initialTrace ?? "");
  const [trace, setTrace] = useState<SpanNode | null>(() => tryParse(initialTrace));
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState("");
  const [loading, setLoading] = useState(false);

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

  const handleFetchJob = useCallback(async () => {
    if (!onFetchTrace || !jobId.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const steps = await onFetchTrace(jobId.trim());
      if (!steps) {
        setError(`No trace found for job ${jobId.trim()}`);
        return;
      }
      setRaw(steps);
      const result = tryParse(steps);
      if (result) {
        setTrace(result);
      } else {
        setError("Job trace found but could not be parsed.");
      }
    } catch {
      setError("Failed to fetch trace.");
    } finally {
      setLoading(false);
    }
  }, [jobId, onFetchTrace]);

  return (
    <div className="space-y-6">
      {/* Job ID lookup */}
      {onFetchTrace && (
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="text-sm font-medium block mb-1.5">Job ID</label>
            <input
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              placeholder="e.g. a1b2c3d4e5f6"
              className="w-full rounded border border-border bg-surface px-3 py-2 font-mono text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-accent"
              onKeyDown={(e) => e.key === "Enter" && handleFetchJob()}
            />
          </div>
          <button
            onClick={handleFetchJob}
            disabled={loading || !jobId.trim()}
            className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {loading ? "Loading..." : "Load trace"}
          </button>
        </div>
      )}

      {/* Paste / upload */}
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
