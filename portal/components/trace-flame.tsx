"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import {
  flattenSpans,
  colorForService,
  totalDurationMs,
  collectServices,
  type SpanNode,
  type FlatSpan,
} from "@/lib/pure/trace";

const ROW_HEIGHT = 28;
const ROW_GAP = 2;
const MIN_BAR_WIDTH = 2;

interface TraceFlameProps {
  trace: SpanNode;
  className?: string;
}

export function TraceFlame({ trace, className }: TraceFlameProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState({ startMs: 0, endMs: totalDurationMs(trace) });
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [zoomStack, setZoomStack] = useState<{ startMs: number; endMs: number }[]>([]);

  const spans = useMemo(() => flattenSpans(trace), [trace]);
  const rootDuration = totalDurationMs(trace);
  const services = useMemo(() => collectServices(trace), [trace]);
  const maxRow = useMemo(() => Math.max(...spans.map((s) => s.row), 0), [spans]);

  const visibleDuration = zoom.endMs - zoom.startMs;

  const handleBarClick = useCallback(
    (span: FlatSpan) => {
      if (span.durationMs <= 0) return;
      setZoomStack((prev) => [...prev, zoom]);
      setZoom({ startMs: span.startMs, endMs: span.startMs + span.durationMs });
    },
    [zoom],
  );

  const handleZoomOut = useCallback(() => {
    if (zoomStack.length > 0) {
      const prev = zoomStack[zoomStack.length - 1];
      setZoomStack((s) => s.slice(0, -1));
      setZoom(prev);
    }
  }, [zoomStack]);

  const handleReset = useCallback(() => {
    setZoomStack([]);
    setZoom({ startMs: 0, endMs: rootDuration });
  }, [rootDuration]);

  const svgHeight = (maxRow + 1) * (ROW_HEIGHT + ROW_GAP) + ROW_GAP;

  return (
    <div className={className}>
      {/* Controls */}
      <div className="mb-3 flex items-center gap-3 text-sm">
        <span className="text-muted-foreground font-mono">
          {formatMs(visibleDuration)}
        </span>
        {zoomStack.length > 0 && (
          <>
            <button
              onClick={handleZoomOut}
              className="text-muted-foreground hover:text-foreground underline"
            >
              Zoom out
            </button>
            <button
              onClick={handleReset}
              className="text-muted-foreground hover:text-foreground underline"
            >
              Reset
            </button>
          </>
        )}
        {/* Legend */}
        <div className="ml-auto flex gap-3">
          {services.map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-3 rounded-sm"
                style={{ background: colorForService(s) }}
              />
              <span className="text-muted-foreground text-xs">{s}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Flame graph */}
      <div
        ref={containerRef}
        className="overflow-auto max-h-[400px] rounded border border-border bg-surface"
      >
        <svg
          width="100%"
          viewBox={`0 0 1000 ${svgHeight}`}
          preserveAspectRatio="none"
          className="block min-w-[600px]"
        >
          {spans.map((span, i) => {
            const x = ((span.startMs - zoom.startMs) / visibleDuration) * 1000;
            const w = Math.max(
              (span.durationMs / visibleDuration) * 1000,
              MIN_BAR_WIDTH,
            );
            const y = span.row * (ROW_HEIGHT + ROW_GAP) + ROW_GAP;

            // Skip bars entirely outside the visible range
            if (x + w < 0 || x > 1000) return null;

            const isHovered = hoveredIdx === i;

            return (
              <g
                key={i}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
                onClick={() => handleBarClick(span)}
                className="cursor-pointer"
              >
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={ROW_HEIGHT}
                  rx={3}
                  fill={colorForService(span.name)}
                  opacity={isHovered ? 1 : 0.85}
                  stroke={isHovered ? "var(--foreground)" : "none"}
                  strokeWidth={isHovered ? 1 : 0}
                />
                {w > 40 && (
                  <text
                    x={x + 6}
                    y={y + ROW_HEIGHT / 2}
                    dominantBaseline="central"
                    fill="white"
                    fontSize={11}
                    fontFamily="var(--font-mono)"
                    pointerEvents="none"
                  >
                    {truncateLabel(span.name, w)}
                  </text>
                )}
                {w > 100 && (
                  <text
                    x={x + w - 6}
                    y={y + ROW_HEIGHT / 2}
                    dominantBaseline="central"
                    textAnchor="end"
                    fill="rgba(255,255,255,0.7)"
                    fontSize={10}
                    fontFamily="var(--font-mono)"
                    pointerEvents="none"
                  >
                    {formatMs(span.durationMs)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Tooltip */}
      {hoveredIdx !== null && spans[hoveredIdx] && (
        <SpanTooltip span={spans[hoveredIdx]} rootDuration={rootDuration} />
      )}
    </div>
  );
}

function SpanTooltip({ span, rootDuration }: { span: FlatSpan; rootDuration: number }) {
  const pct = rootDuration > 0 ? ((span.durationMs / rootDuration) * 100).toFixed(1) : "0";
  const attrs = Object.entries(span.attributes).filter(
    ([k]) => k !== "service",
  );

  return (
    <div className="mt-2 rounded border border-border bg-surface p-3 text-sm font-mono">
      <div className="flex items-center gap-2 mb-1">
        <span
          className="inline-block h-2.5 w-2.5 rounded-sm"
          style={{ background: colorForService(span.name) }}
        />
        <span className="font-semibold">{span.name}</span>
        <span className="text-muted-foreground ml-auto">
          {formatMs(span.durationMs)} ({pct}%)
        </span>
      </div>
      {attrs.length > 0 && (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
          {attrs.map(([k, v]) => (
            <Fragment key={k}>
              <dt className="text-muted-foreground">{k}</dt>
              <dd>{String(v)}</dd>
            </Fragment>
          ))}
        </dl>
      )}
    </div>
  );
}

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${Math.round(ms)}ms`;
}

function truncateLabel(label: string, widthUnits: number): string {
  const maxChars = Math.floor(widthUnits / 7);
  if (label.length <= maxChars) return label;
  return label.slice(0, maxChars - 1) + "\u2026";
}

import { Fragment } from "react";
