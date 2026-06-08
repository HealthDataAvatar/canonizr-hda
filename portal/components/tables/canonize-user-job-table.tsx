"use client";

import { useMemo } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { Download, Trash2, Loader, Check, TriangleAlert, ShieldOff } from "lucide-react";
import { filesize } from "filesize";
import { timeAgo } from "@/lib/pure/time";
import { formatKB, toBillableKB } from "@/lib/pure/format";
import { IconButton } from "@/components/ui/icon-button";
import { IconHint } from "@/components/ui/icon-hint";
import { IconLink } from "@/components/ui/icon-link";
import { Mono } from "@/components/ui/mono";
import { CopyButton } from "@/components/ui/copy-button";
import { DataTable } from "@/components/ui/data-table";
import { TableExport } from "@/components/ui/table-export";
import { parseArtefacts } from "@/lib/pure/artefacts";
import { CanonizeJobRow } from "@/lib/pure/job-types";
import { calculateBilling } from "@/lib/pure/billing-calc";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BlobState =
  | { status: "available"; url: string }
  | { status: "processing" }
  | { status: "expired" }
  | { status: "none" };

export type JobType = "canonize" | "describe" | "";


function StatusIcon({ row }: { row: CanonizeJobRow }) {

  if (row.status === "processing") {
    return <IconHint icon={Loader} title={`Submitted ${new Date(row.submittedAt).toLocaleString()}`} isSpinning />;
  }
  if (row.status === "error") {
    return <IconHint icon={TriangleAlert} title={`Error ${row.completedAt}`} tone="destructive" />;
  }
  if (row.status === "ok") {
    return <IconHint icon={Check} title={row.submittedAt ? `Completed ${new Date(row.completedAt).toLocaleString()}` : "Success"} />;

  }
  if (row.status === "expired") {
    return <IconHint icon={ShieldOff} title={`Expired ${row.expiredAt}`} tone="muted" />;
  }
}

function DeleteButton({ rowId, onDelete }: { rowId: string; onDelete: (id: string) => void }) {
  return (
    <IconButton
      icon={Trash2}
      title="Delete stored data"
      tone="destructive"
      onClick={() => {
        if (confirm("Delete all stored data for this request? This cannot be undone.")) {
          onDelete(rowId);
        }
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Expanded detail panel
// ---------------------------------------------------------------------------


function CanonizeUserJobPanel({ row, artefactUrl }: { row: CanonizeJobRow; artefactUrl?: (jobId: string, name: string) => string }) {
  switch (row.status) {
    case "processing":
      return <p className="text-sm text-muted-foreground">Processing…</p>;

    case "error":
      return <p className="text-sm text-destructive">{row.error}</p>;

    case "expired":
      return <p className="text-sm text-muted-foreground">Results expired</p>;

    case "ok":
      if (row.artefacts.length === 0) {
        return <p className="text-sm text-muted-foreground">No artefacts</p>;
      }
      return (
        <ul className="space-y-1">
          {row.artefacts.map((a) => (
            <li key={a.name} className="flex items-center gap-2 text-sm">
              {artefactUrl ? (
                <a
                  href={artefactUrl(row.id, a.name)}
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <Download className="h-3.5 w-3.5" />
                  {a.label}
                </a>
              ) : (
                <span>{a.label}</span>
              )}
              <span className="text-muted-foreground">{filesize(a.size_bytes)}</span>
            </li>
          ))}
        </ul>
      );
  }
}

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

const col = createColumnHelper<CanonizeJobRow>();

function buildColumns(onDelete: (id: string) => void, highlightIds?: Set<string>) {
  return [
    col.accessor("submittedAt", {
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
    col.accessor("filename", {
      header: "Filename",
      enableSorting: true,
      cell: ({ getValue }) => <Mono muted>{getValue()}</Mono>,
    }),
    col.accessor("keyId", {
      header: "Key",
      enableSorting: true,
      cell: ({ getValue }) => <Mono muted>{getValue()}</Mono>,
    }),
    col.accessor("inputBytes", {
      header: "Size",
      size: 90,
      enableSorting: true,
      cell: ({ getValue }) => <Mono>{formatKB(toBillableKB(getValue()))}</Mono>,
    }),
    col.accessor("mimeType", {
      header: "Type",
      size: 120,
      enableSorting: true,
      cell: ({ getValue }) => {
        const v = getValue();
        return v ? <Mono muted>{v}</Mono> : <span className="text-sm truncate">—</span>;
      },
    }),
    col.accessor("status", {
      header: "Status",
      size: 60,
      enableSorting: true,
      cell: ({ row }) => <StatusIcon row={row.original} />,
    }),
    col.display({
      id: "actions",
      header: "",
      size: 40,
      cell: ({ row }) => {
        const r = row.original;
        if (r.status !== "ok") return null;
        return <DeleteButton rowId={r.id} onDelete={onDelete} />;
      },
    }),
  ];
}

// ---------------------------------------------------------------------------
// Mobile columns (Time, Size, Status — rest in expanded content)
// ---------------------------------------------------------------------------

const mobileColumns = [
  col.accessor("submittedAt", {
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
  col.accessor("filename", {
    header: "Filename",
    enableSorting: true,
    cell: ({ getValue }) => <Mono muted>{getValue()}</Mono>,
  }),
  col.accessor("status", {
    header: "Status",
    size: 60,
    enableSorting: true,
    cell: ({ row }) => <StatusIcon row={row.original} />,
  }),
];

function MobileDetailPanel({ row, onDelete, artefactUrl }: { row: CanonizeJobRow; onDelete?: (id: string) => void; artefactUrl?: (jobId: string, name: string) => string }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
        <span className="text-muted-foreground">Key</span>
        <span className="font-mono">{row.keyId}</span>
        <span className="text-muted-foreground">Job ID</span>
        <span className="inline-flex items-center gap-1 font-mono">
          {row.id.slice(0, 8)}
          <CopyButton value={row.id} />
        </span>
        <span className="text-muted-foreground">Time</span>
        <span className="font-mono">{new Date(row.submittedAt).toLocaleString()}</span>
      </div>

      <CanonizeUserJobPanel row={row} artefactUrl={artefactUrl} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export function requestExportRows(requests: CanonizeJobRow[]): { headers: string[]; rows: string[][] } {
  const headers = ["Time", "Key", "Job ID", "Size", "Status", "File", "Type"];
  const rows = requests.map((r) => [
    new Date(r.submittedAt).toLocaleString(),
    r.keyId,
    r.id,
    formatKB(r.inputBytes),
    String(r.status),
    r.filename ?? "",
    r.mimeType ?? "",
  ]);
  return { headers, rows };
}

export function CanonizeUserJobTable({
  jobs,
  onDelete,
  artefactUrl,
  highlightIds,
}: {
  jobs: CanonizeJobRow[];
  onDelete?: (id: string) => void;
  artefactUrl?: (jobId: string, artefactName: string) => string;
  highlightIds?: Set<string>;
}) {
  const columns = useMemo(() => buildColumns(onDelete ?? (x => { }), highlightIds), [onDelete, highlightIds]);
  const { headers, rows } = requestExportRows(jobs);
  return (
    <DataTable
      columns={columns}
      data={jobs}
      caption="Job history"
      emptyMessage="No requests yet."
      actions={<TableExport headers={headers} rows={rows} filenameBase="requests" />}
      sortable
      defaultSort={[{ id: "timestamp", desc: true }]}
      pageSize={20}
      getRowId={(row) => row.id}
      expandedContent={(row) => <CanonizeUserJobPanel row={row} artefactUrl={artefactUrl} />}
      mobile={{
        columns: mobileColumns,
        expandedContent: (row) => <MobileDetailPanel row={row} onDelete={onDelete} artefactUrl={artefactUrl} />,
      }}
      tableClassName="table-fixed"
    />
  );
}
