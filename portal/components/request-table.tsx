"use client";

import { useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  createColumnHelper,
  flexRender,
  type SortingState,
} from "@tanstack/react-table";
import { Download, TimerOff, Trash2, Loader, Check, TriangleAlert, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { timeAgo } from "@/lib/pure/time";
import { formatKB } from "@/lib/pure/format";
import { IconHint } from "@/components/ui/icon-hint";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function BlobLink({ blob, label }: { blob: BlobState; label: string }) {
  switch (blob.status) {
    case "available":
      return (
        <a
          href={blob.url}
          target="_blank"
          rel="noopener noreferrer"
          title={`Download ${label}`}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <Download className="size-4" />
        </a>
      );
    case "processing":
      return <IconHint icon={Loader} title={`${label} processing`} tone="faded" className="[&_svg]:animate-spin [&_svg]:[animation-duration:6s]" />;
    case "expired":
      return <IconHint icon={TimerOff} title={`${label} expired`} tone="faded" />;
    case "none":
      return <span className="text-[0.75rem] text-muted-foreground">—</span>;
  }
}

function StatusIcon({ row }: { row: RequestRow }) {
  if (row.status === 200) {
    return <IconHint icon={Check} title={row.completedAt ? `Completed ${new Date(row.completedAt).toLocaleString()}` : "Success"} />;
  }
  if (row.status === 202) {
    return <IconHint icon={Loader} title={`Submitted ${new Date(row.timestamp).toLocaleString()}`} tone="faded" className="[&_svg]:animate-spin [&_svg]:[animation-duration:6s]" />;
  }
  return <IconHint icon={TriangleAlert} title={`Error ${row.status} — ${new Date(row.timestamp).toLocaleString()}`} tone="destructive" />;
}

function isDeletable(row: RequestRow): boolean {
  return row.result.status === "available" || row.input.status === "available";
}

function DeleteButton({ row, onDelete }: { row: RequestRow; onDelete: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => {
        if (confirm("Delete all stored data for this request? This cannot be undone.")) {
          onDelete(row.id);
        }
      }}
      title="Delete stored data"
      className="rounded-md text-muted-foreground hover:text-destructive transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Trash2 className="size-4" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Desktop table (hidden below sm)
// ---------------------------------------------------------------------------

const col = createColumnHelper<RequestRow>();

function SortIcon({ sorted }: { sorted: false | "asc" | "desc" }) {
  if (!sorted) return <ChevronUp className="size-3 opacity-0 group-hover:opacity-30" />;
  return sorted === "asc"
    ? <ChevronUp className="size-3" />
    : <ChevronDown className="size-3" />;
}

const PAGE_SIZE = 20;

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
            <span className="font-mono text-[0.875rem]">
              {new Date(ts).toLocaleString()}
            </span>
            <span className="text-[0.75rem] text-muted-foreground">
              {timeAgo(ts)}
            </span>
          </div>
        );
      },
    }),
    col.accessor("keyName", {
      header: "Key",
      enableSorting: true,
      cell: ({ getValue }) => (
        <span className="font-mono text-[0.8125rem] text-muted-foreground">
          {getValue()}
        </span>
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
          <span className="inline-flex items-center gap-1 font-mono text-[0.75rem] text-muted-foreground" title={title}>
            {r.id.slice(0, 8)}
            <CopyButton value={r.id} />
          </span>
        );
      },
    }),
    col.accessor("billableKB", {
      header: "Billed",
      size: 90,
      enableSorting: true,
      cell: ({ getValue }) => (
        <span className="font-mono text-[0.875rem]">{formatKB(getValue())}</span>
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

function DesktopTable({
  table,
}: {
  table: ReturnType<typeof useReactTable<RequestRow>>;
}) {
  return (
    <Table className="table-fixed">
      <caption className="sr-only">Job history</caption>
      <TableHeader>
        {table.getHeaderGroups().map((hg) => (
          <TableRow key={hg.id}>
            {hg.headers.map((header) => (
              <TableHead
                key={header.id}
                className={header.column.getCanSort() ? "cursor-pointer select-none group" : ""}
                style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                onClick={header.column.getToggleSortingHandler()}
                title={header.column.getCanSort() ? "Sort" : undefined}
              >
                <span className="inline-flex items-center gap-1">
                  {flexRender(header.column.columnDef.header, header.getContext())}
                  {header.column.getCanSort() && (
                    <SortIcon sorted={header.column.getIsSorted()} />
                  )}
                </span>
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow
            key={row.original.id}
            id={row.original.id}
            className="scroll-mt-24 target:bg-accent-subtle"
          >
            {row.getVisibleCells().map((cell) => (
              <TableCell key={cell.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ---------------------------------------------------------------------------
// Mobile list (visible below sm)
// ---------------------------------------------------------------------------

function MobileCard({
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
            <span className="font-mono text-[0.875rem]">
              {new Date(row.timestamp).toLocaleString()}
            </span>
            <span className="font-mono text-[0.8125rem]">
              {formatKB(row.billableKB)}
            </span>
          </div>
          <span className="font-mono text-[0.75rem] text-muted-foreground">
            {row.keyName} · {timeAgo(row.timestamp)}
          </span>
        </div>
        <StatusIcon row={row} />
      </button>

      {isExpanded && (
        <div className="border-t border-border px-4 py-3 space-y-3">
          <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-[0.8125rem]">
            <span className="text-muted-foreground">Job ID</span>
            <span className="inline-flex items-center gap-1 font-mono text-[0.75rem]">
              {row.id.slice(0, 8)}
              <CopyButton value={row.id} />
            </span>

            {row.fileHash && (
              <>
                <span className="text-muted-foreground">Hash</span>
                <span className="inline-flex items-center gap-1 font-mono text-[0.75rem]">
                  {row.fileHash.slice(0, 8)}
                  <CopyButton value={row.fileHash} />
                </span>
              </>
            )}
          </div>

          <div className="grid grid-cols-[1fr_1fr_auto] items-center border-t border-border pt-3">
            <div className="flex items-center gap-2">
              <span className="text-[0.8125rem] text-muted-foreground">Output</span>
              <BlobLink blob={row.result} label="output" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[0.8125rem] text-muted-foreground">Original</span>
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

function MobileList({
  rows,
  onDelete,
}: {
  rows: RequestRow[];
  onDelete?: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <MobileCard key={r.id} row={r} onDelete={onDelete} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

function Pagination({ table }: { table: ReturnType<typeof useReactTable<RequestRow>> }) {
  if (table.getPageCount() <= 1) return null;
  return (
    <div className="flex items-center justify-between">
      <p className="text-[0.8125rem] text-muted-foreground">
        Page {table.getState().pagination.pageIndex + 1} of{" "}
        {table.getPageCount()}
      </p>
      <div className="flex gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
          title="Previous page"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
          title="Next page"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public component — switches between desktop and mobile
// ---------------------------------------------------------------------------

export function RequestTable({
  requests,
  onDelete,
}: {
  requests: RequestRow[];
  onDelete?: (id: string) => void;
}) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "timestamp", desc: true },
  ]);

  const columns = buildColumns(onDelete);

  const table = useReactTable({
    data: requests,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    enableSortingRemoval: false,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: PAGE_SIZE } },
  });

  const pageRows = table.getRowModel().rows.map((r) => r.original);

  return (
    <div className="@container space-y-4">
      <div className="hidden @[640px]:block">
        <DesktopTable table={table} />
      </div>
      <div className="@[640px]:hidden">
        <MobileList rows={pageRows} onDelete={onDelete} />
      </div>
      <Pagination table={table} />
    </div>
  );
}
