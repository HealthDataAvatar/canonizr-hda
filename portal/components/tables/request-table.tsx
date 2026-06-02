"use client";

import { useMemo } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { Download, TimerOff, Trash2, Loader, Check, TriangleAlert } from "lucide-react";
import { timeAgo } from "@/lib/pure/time";
import { formatKB } from "@/lib/pure/format";
import { ActionGroup } from "@/components/ui/action-group";
import { IconButton } from "@/components/ui/icon-button";
import { IconHint } from "@/components/ui/icon-hint";
import { IconLink } from "@/components/ui/icon-link";
import { Mono } from "@/components/ui/mono";
import { CopyButton } from "@/components/ui/copy-button";
import { DataTable } from "@/components/ui/data-table";
import { TableExport } from "@/components/ui/table-export";

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
  retentionExpires?: string;
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

function hasJobDetail(row: RequestRow): boolean {
  return !!(row.detail || row.steps || row.originalFilename || row.mimeType);
}

function JobDetailPanel({ row }: { row: RequestRow }) {
  let steps: { service: string; duration_ms?: number; error?: string }[] = [];
  try {
    if (row.steps) steps = JSON.parse(row.steps);
  } catch {}

  if (!hasJobDetail(row)) return null;

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
            <Mono>{new Date(ts).toLocaleString()}</Mono>
            <span className="text-sm text-muted-foreground">{timeAgo(ts)}</span>
          </div>
        );
      },
    }),
    col.accessor("keyName", {
      header: "Key",
      enableSorting: true,
      cell: ({ getValue }) => <Mono muted>{getValue()}</Mono>,
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
          <Mono muted className="inline-flex items-center gap-1" title={title}>
            {r.id.slice(0, 8)}
            <CopyButton value={r.id} />
          </Mono>
        );
      },
    }),
    col.accessor("billableKB", {
      header: "Size",
      size: 90,
      enableSorting: true,
      cell: ({ getValue }) => <Mono>{formatKB(getValue())}</Mono>,
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
// Mobile columns (Time, Size, Status — rest in expanded content)
// ---------------------------------------------------------------------------

const mobileColumns = [
  col.accessor("timestamp", {
    header: "Time",
    enableSorting: true,
    cell: ({ getValue }) => <Mono>{timeAgo(getValue())}</Mono>,
  }),
  col.accessor("billableKB", {
    header: "Size",
    enableSorting: true,
    cell: ({ getValue }) => <Mono>{formatKB(getValue())}</Mono>,
  }),
  col.accessor("status", {
    header: "",
    size: 40,
    enableSorting: false,
    cell: ({ row }) => <StatusIcon row={row.original} />,
  }),
];

function MobileDetailPanel({ row, onDelete }: { row: RequestRow; onDelete?: (id: string) => void }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
        <span className="text-muted-foreground">Key</span>
        <span className="font-mono">{row.keyName}</span>
        <span className="text-muted-foreground">Job ID</span>
        <span className="inline-flex items-center gap-1 font-mono">
          {row.id.slice(0, 8)}
          <CopyButton value={row.id} />
        </span>
        <span className="text-muted-foreground">Time</span>
        <span className="font-mono">{new Date(row.timestamp).toLocaleString()}</span>
      </div>

      <JobDetailPanel row={row} />

      <div className="flex items-center gap-4 border-t border-border pt-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Output</span>
          <BlobLink blob={row.result} label="output" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Original</span>
          <BlobLink blob={row.input} label="original" />
        </div>
        {isDeletable(row) && onDelete && <DeleteButton row={row} onDelete={onDelete} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export function requestExportRows(requests: RequestRow[]): { headers: string[]; rows: string[][] } {
  const headers = ["Time", "Key", "Job ID", "Size", "Status", "File", "Type"];
  const rows = requests.map((r) => [
    new Date(r.timestamp).toLocaleString(),
    r.keyName,
    r.id,
    formatKB(r.billableKB),
    String(r.status),
    r.originalFilename ?? "",
    r.mimeType ?? "",
  ]);
  return { headers, rows };
}

export function RequestTable({
  requests,
  onDelete,
}: {
  requests: RequestRow[];
  onDelete?: (id: string) => void;
}) {
  const columns = useMemo(() => buildColumns(onDelete), [onDelete]);
  const { headers, rows } = requestExportRows(requests);
  return (
    <DataTable
      columns={columns}
      data={requests}
      caption="Job history"
      emptyMessage="No requests yet."
      actions={<TableExport headers={headers} rows={rows} filenameBase="requests" />}
      sortable
      defaultSort={[{ id: "timestamp", desc: true }]}
      pageSize={20}
      getRowId={(row) => row.id}
      expandedContent={(row) => hasJobDetail(row) ? <JobDetailPanel row={row} /> : null}
      mobile={{
        columns: mobileColumns,
        expandedContent: (row) => <MobileDetailPanel row={row} onDelete={onDelete} />,
      }}
      tableClassName="table-fixed"
    />
  );
}
