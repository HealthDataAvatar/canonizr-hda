"use client";

import { useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { Download, TimerOff, Trash2, Loader, Check, TriangleAlert } from "lucide-react";
import { timeAgo } from "@/lib/pure/time";
import { formatKB } from "@/lib/pure/format";
import { ActionGroup } from "@/components/ui/action-group";
import { IconButton } from "@/components/ui/icon-button";
import { IconHint } from "@/components/ui/icon-hint";
import { IconLink } from "@/components/ui/icon-link";
import { CopyButton } from "@/components/ui/copy-button";
import { DataTable } from "@/components/ui/data-table";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BlobState =
  | { status: "available"; url: string }
  | { status: "processing" }
  | { status: "expired" }
  | { status: "none" };

export interface RequestRow {
  id: string;
  timestamp: string;
  completedAt?: string;
  keyName: string;
  fileHash?: string;
  billableKB: number;
  status: number;
  result: BlobState;
  input: BlobState;
  detail?: string;
  steps?: string;
  originalFilename?: string;
  mimeType?: string;
  inputBytes?: number;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function BlobLink({ blob, label }: { blob: BlobState; label: string }) {
  switch (blob.status) {
    case "available":
      return (
        <IconLink
          icon={Download}
          title={`Download ${label}`}
          href={blob.url}
          target="_blank"
          rel="noopener noreferrer"
        />
      );
    case "processing":
      return <IconHint icon={Loader} title={`${label} processing`} isSpinning />;
    case "expired":
      return <IconHint icon={TimerOff} title={`${label} expired`} />;
    case "none":
      return <span className="text-sm text-muted-foreground">—</span>;
  }
}

function StatusIcon({ row }: { row: RequestRow }) {
  if (row.status === 200) {
    return <IconHint icon={Check} title={row.completedAt ? `Completed ${new Date(row.completedAt).toLocaleString()}` : "Success"} />;
  }
  if (row.status === 202) {
    return <IconHint icon={Loader} title={`Submitted ${new Date(row.timestamp).toLocaleString()}`} isSpinning />;
  }
  return <IconHint icon={TriangleAlert} title={`Error ${row.status} — ${new Date(row.timestamp).toLocaleString()}`} tone="destructive" />;
}

function isDeletable(row: RequestRow): boolean {
  return row.result.status === "available" || row.input.status === "available";
}

function DeleteButton({ row, onDelete }: { row: RequestRow; onDelete: (id: string) => void }) {
  return (
    <IconButton
      icon={Trash2}
      title="Delete stored data"
      tone="destructive"
      onClick={() => {
        if (confirm("Delete all stored data for this request? This cannot be undone.")) {
          onDelete(row.id);
        }
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Expanded detail panel
// ---------------------------------------------------------------------------

function JobDetailPanel({ row }: { row: RequestRow }) {
  let steps: { service: string; duration_ms?: number; error?: string }[] = [];
  try {
    if (row.steps) steps = JSON.parse(row.steps);
  } catch {}

  const hasDetail = row.detail || steps.length > 0 || row.originalFilename || row.mimeType;
  if (!hasDetail) return null;

  return (
    <div className="space-y-2 text-sm">
      {(row.originalFilename || row.mimeType) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
          {row.originalFilename && <span>File: <span className="font-mono">{row.originalFilename}</span></span>}
          {row.mimeType && <span>Type: <span className="font-mono">{row.mimeType}</span></span>}
          {row.inputBytes != null && <span>Size: <span className="font-mono">{formatKB(Math.round(row.inputBytes / 1024))}</span></span>}
        </div>
      )}
      {steps.length > 0 && (
        <div className="space-y-0.5">
          <span className="text-muted-foreground">Pipeline:</span>
          <div className="flex flex-wrap gap-1.5">
            {steps.map((s, i) => (
              <span
                key={i}
                className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-sm ${
                  s.error
                    ? "bg-destructive/10 text-destructive"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {s.service}
                {s.duration_ms != null && (
                  <span className="text-[0.6875rem] opacity-60">
                    {s.duration_ms >= 1000 ? `${(s.duration_ms / 1000).toFixed(1)}s` : `${s.duration_ms}ms`}
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}
      {row.detail && (
        <div className={`rounded-md px-3 py-2 font-mono text-sm whitespace-pre-wrap ${
          row.status >= 400
            ? "bg-destructive/10 text-destructive"
            : "bg-muted text-muted-foreground"
        }`}>
          {row.detail}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

const col = createColumnHelper<RequestRow>();

function buildColumns(onDelete?: (id: string) => void) {
  return [
    col.accessor("timestamp", {
      header: "Time",
      size: 180,
      enableSorting: true,
      cell: ({ getValue }) => {
        const ts = getValue();
        return (
          <div className="flex flex-col">
            <span className="font-mono text-sm">{new Date(ts).toLocaleString()}</span>
            <span className="text-sm text-muted-foreground">{timeAgo(ts)}</span>
          </div>
        );
      },
    }),
    col.accessor("keyName", {
      header: "Key",
      enableSorting: true,
      cell: ({ getValue }) => (
        <span className="font-mono text-sm text-muted-foreground">{getValue()}</span>
      ),
    }),
    col.accessor("id", {
      header: "Job",
      size: 100,
      enableSorting: false,
      cell: ({ row }) => {
        const r = row.original;
        const title = r.fileHash
          ? `Job: ${r.id}\nHash: ${r.fileHash}`
          : `Job: ${r.id}`;
        return (
          <span className="inline-flex items-center gap-1 font-mono text-sm text-muted-foreground" title={title}>
            {r.id.slice(0, 8)}
            <CopyButton value={r.id} />
          </span>
        );
      },
    }),
    col.accessor("billableKB", {
      header: "Size",
      size: 90,
      enableSorting: true,
      cell: ({ getValue }) => (
        <span className="font-mono text-sm">{formatKB(getValue())}</span>
      ),
    }),
    col.accessor("status", {
      header: "Status",
      size: 60,
      enableSorting: true,
      cell: ({ row }) => <StatusIcon row={row.original} />,
    }),
    col.display({
      id: "result",
      header: "Output",
      size: 60,
      cell: ({ row }) => <BlobLink blob={row.original.result} label="output" />,
    }),
    col.display({
      id: "input",
      header: "Original",
      size: 60,
      cell: ({ row }) => <BlobLink blob={row.original.input} label="original" />,
    }),
    col.display({
      id: "actions",
      header: "",
      size: 40,
      cell: ({ row }) => {
        const r = row.original;
        if (!isDeletable(r) || !onDelete) return null;
        return <DeleteButton row={r} onDelete={onDelete} />;
      },
    }),
  ];
}

// ---------------------------------------------------------------------------
// Mobile card
// ---------------------------------------------------------------------------

function MobileRequestCard({
  row,
  onDelete,
}: {
  row: RequestRow;
  onDelete?: (id: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      id={row.id}
      className="scroll-mt-24 rounded-lg border border-border target:bg-accent-subtle"
    >
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-left cursor-pointer"
        aria-expanded={isExpanded}
      >
        <div className="flex flex-col gap-0.5">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-sm">{new Date(row.timestamp).toLocaleString()}</span>
            <span className="font-mono text-sm">{formatKB(row.billableKB)}</span>
          </div>
          <span className="font-mono text-sm text-muted-foreground">
            {row.keyName} · {timeAgo(row.timestamp)}
          </span>
        </div>
        <StatusIcon row={row} />
      </button>

      {isExpanded && (
        <div className="border-t border-border px-4 py-3 space-y-3">
          <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
            <span className="text-muted-foreground">Job ID</span>
            <span className="inline-flex items-center gap-1 font-mono text-sm">
              {row.id.slice(0, 8)}
              <CopyButton value={row.id} />
            </span>
            {row.fileHash && (
              <>
                <span className="text-muted-foreground">Hash</span>
                <span className="inline-flex items-center gap-1 font-mono text-sm">
                  {row.fileHash.slice(0, 8)}
                  <CopyButton value={row.fileHash} />
                </span>
              </>
            )}
          </div>

          <JobDetailPanel row={row} />

          <div className="grid grid-cols-[1fr_1fr_auto] items-center border-t border-border pt-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Output</span>
              <BlobLink blob={row.result} label="output" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Original</span>
              <BlobLink blob={row.input} label="original" />
            </div>
            {isDeletable(row) && onDelete ? (
              <DeleteButton row={row} onDelete={onDelete} />
            ) : <span />}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export function RequestTable({
  requests,
  onDelete,
}: {
  requests: RequestRow[];
  onDelete?: (id: string) => void;
}) {
  return (
    <DataTable
      columns={buildColumns(onDelete)}
      data={requests}
      caption="Job history"
      emptyMessage="No requests yet."
      sortable
      defaultSort={[{ id: "timestamp", desc: true }]}
      pageSize={20}
      getRowId={(row) => row.id}
      expandedContent={(row) => <JobDetailPanel row={row} />}
      mobileCard={(row) => <MobileRequestCard row={row} onDelete={onDelete} />}
      tableClassName="table-fixed"
    />
  );
}
