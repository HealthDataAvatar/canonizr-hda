"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { Download, Delete, Processing, Success, Warning, Expired } from "@/components/ui/icons";
import { filesize } from "filesize";
import { formatKB, toBillableKB } from "@/lib/pure/format";
import { IconButton } from "@/components/ui/icon-button";
import { IconHint } from "@/components/ui/icon-hint";
import { IconLink } from "@/components/ui/icon-link";
import { Mono } from "@/components/ui/mono";
import { CopyButton } from "@/components/ui/copy-button";
import { DataTable } from "@/components/ui/data-table";
import { DefinitionList } from "@/components/ui/definition-list";
import { PreviewStrip } from "@/components/ui/preview-strip";
import { TableExport } from "@/components/ui/table-export";
import { displayLabel } from "@/lib/pure/artefacts";
import { CanonizeJobRow } from "@/lib/pure/job-types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BlobState =
  | { status: "available"; url: string }
  | { status: "processing" }
  | { status: "expired" }
  | { status: "none" };


function StatusIcon({ row }: { row: CanonizeJobRow }) {

  if (row.status === "processing") {
    return <IconHint icon={Processing} title={`Submitted ${new Date(row.submittedAt).toLocaleString()}`} isSpinning />;
  }
  if (row.status === "error") {
    return <IconHint icon={Warning} title={`Error ${new Date(row.completedAt).toLocaleString()}`} tone="destructive" />;
  }
  if (row.status === "ok") {
    return <IconHint icon={Success} title={row.submittedAt ? `Completed ${new Date(row.completedAt).toLocaleString()}` : "Success"} />;

  }
  if (row.status === "expired") {
    return <IconHint icon={Expired} title={`Expired ${new Date(row.expiredAt).toLocaleString()}`} tone="muted" />;
  }
}

function DeleteButton({ rowId, onDelete }: { rowId: string; onDelete: (id: string) => void }) {
  return (
    <IconButton
      icon={Delete}
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


import type { ArtefactEntry } from "@/lib/pure/artefacts";
import { ReactNode } from "react";
import { calculateBilling } from "@/lib/pure/billing-calc";


function DownloadFileListEntry({ actionNode, label, size }: { actionNode: ReactNode, label: string, size?: number }) {
  return <li className="flex items-center gap-2 text-sm">
    {actionNode}
    <span>{label}</span>
    {(size && <span className="text-muted-foreground">{filesize(size)}</span>)}
  </li>
}

function ArtefactList({ entries, title, url }: { entries: ArtefactEntry[], title: string, url: (name: string) => string | undefined }) {
  if (entries.length == 0) {
    return null;
  }
  return <>{
    title && (
      <li className="text-muted-foreground">{title}</li>
    )
  }
    <ul>
      {
        entries.map((a) => (
          <ArtefactRow key={a.name} entry={a} url={url(a.name)} />
        ))
      }
    </ul>
  </>
}



function ArtefactRow({ entry, url }: { entry: ArtefactEntry; url?: string }) {
  const label = displayLabel(entry);
  return (
    <DownloadFileListEntry
      actionNode={url && <IconLink icon={Download} title={`Download ${label}`} href={url} />}
      label={label}
      size={entry.size_bytes}
    />
  );
}

function groupArtefacts(artefacts: ArtefactEntry[]) {
  const previews: ArtefactEntry[] = [];
  const pages: ArtefactEntry[] = [];
  const images: ArtefactEntry[] = [];
  const tables: ArtefactEntry[] = [];
  const other: ArtefactEntry[] = [];

  for (const a of artefacts) {
    if (a.name.startsWith("preview-")) previews.push(a);
    else if (a.name.startsWith("page-")) pages.push(a);
    else if (a.name.startsWith("image-")) images.push(a);
    else if (a.name.startsWith("table-")) tables.push(a);
    else other.push(a);
  }
  return { previews, pages, images, tables, other };
}

function ManifestDownload({ artefacts, jobId }: { artefacts: ArtefactEntry[]; jobId: string }) {
  // ponytail: data URI instead of createObjectURL — no blob lifecycle to revoke.
  const href = "data:application/json," + encodeURIComponent(JSON.stringify(artefacts, null, 2));
  return <DownloadFileListEntry
      actionNode={<IconLink icon={Download} title={`Download job manifest`} href={href} download={`manifest-${jobId}.json`} />}
      label={"Job Manifest"}
    />
}

function CanonizeUserJobPanel({ row, artefactUrl }: { row: CanonizeJobRow; artefactUrl?: (jobId: string, name: string) => string }) {
  switch (row.status) {
    case "processing":
      return <p className="text-sm text-muted-foreground">Processing…</p>;

    case "error":
      return <p className="text-sm text-destructive">{row.error}</p>;

    case "expired":
      return <p className="text-sm text-muted-foreground">Results expired</p>;

    case "ok": {
      if (row.artefacts.length === 0) {
        return <p className="text-sm text-muted-foreground">No artefacts</p>;
      }

      const { previews, images, tables, other } = groupArtefacts(row.artefacts);
      const url = (name: string) => artefactUrl?.(row.id, name);

      return (
        <div className="space-y-3">
          {/* Page preview strip */}
          {previews.length > 0 && (
            <PreviewStrip previews={previews} artefactUrl={artefactUrl} jobId={row.id} />
          )}
          <ArtefactList title="" entries={other} url={url} />
          <ArtefactList title="Images" entries={images} url={url} />
          <ArtefactList title="Tables" entries={tables} url={url} />
          {/* Manifest download */}
          <ManifestDownload artefacts={row.artefacts} jobId={row.id} />
        </div>
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

const col = createColumnHelper<CanonizeJobRow>();

// Shared columns (used in both desktop and mobile layouts)
const submittedAtCol = col.accessor("submittedAt", {
  header: "Time",
  size: 180,
  enableSorting: true,
  cell: ({ getValue }) => {
    const ts = getValue();
    return (
      <div className="flex flex-col">
        <Mono>{new Date(ts).toLocaleString()}</Mono>
      </div>
    );
  },
});

const filenameCol = col.accessor("filename", {
  header: "Filename",
  enableSorting: true,
  cell: ({ getValue }) => <Mono muted>{getValue()}</Mono>,
});

const statusCol = col.accessor("status", {
  header: "Status",
  size: 60,
  enableSorting: true,
  cell: ({ row }) => <StatusIcon row={row.original} />,
});

const desktopColumns = [
  submittedAtCol,
  filenameCol,
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
  statusCol,
];

const mobileColumns = [submittedAtCol, filenameCol, statusCol];

function JobDetailPanel({ row, onDelete, artefactUrl }: {
  row: CanonizeJobRow;
  onDelete?: (id: string) => void;
  artefactUrl?: (jobId: string, name: string) => string;
}) {
  return (
    <div className="space-y-4">
      <CanonizeUserJobPanel row={row} artefactUrl={artefactUrl} />
      <DefinitionList
        items={[
          { label: "Key", value: <Mono>{row.keyId}</Mono> },
          { label: "Job ID", value: <><Mono>{row.id}</Mono>{" "}<CopyButton value={row.id} /></> },
          { label: "Size (billed)", value: <Mono>{formatKB(toBillableKB(row.inputBytes))}</Mono> },
        ]}
      />
      {onDelete && row.status === "ok" && (
        <DeleteButton rowId={row.id} onDelete={onDelete} />
      )}
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
}: {
  jobs: CanonizeJobRow[];
  onDelete?: (id: string) => void;
  artefactUrl?: (jobId: string, artefactName: string) => string;
}) {
  const { headers, rows } = requestExportRows(jobs);
  return (
    <DataTable
      columns={desktopColumns}
      data={jobs}
      caption="Job history"
      emptyMessage="No requests yet."
      actions={<TableExport headers={headers} rows={rows} filenameBase="requests" />}
      sortable
      defaultSort={[{ id: "submittedAt", desc: true }]}
      pageSize={20}
      getRowId={(row) => row.id}
      expandedContent={(row) => <JobDetailPanel row={row} onDelete={onDelete} artefactUrl={artefactUrl} />}
      mobile={{
        columns: mobileColumns,
        expandedContent: (row) => <JobDetailPanel row={row} onDelete={onDelete} artefactUrl={artefactUrl} />,
      }}
      tableClassName="table-fixed"
    />
  );
}
