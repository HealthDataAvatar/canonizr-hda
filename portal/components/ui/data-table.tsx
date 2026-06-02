"use client";

import { useState, type ReactNode } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ---------------------------------------------------------------------------
// Sort indicator
// ---------------------------------------------------------------------------

function SortIcon({ sorted }: { sorted: false | "asc" | "desc" }) {
  if (!sorted) return <ChevronUp className="size-3 opacity-0 group-hover:opacity-30" />;
  return sorted === "asc"
    ? <ChevronUp className="size-3" />
    : <ChevronDown className="size-3" />;
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

function Pagination<T>({ table }: { table: ReturnType<typeof useReactTable<T>> }) {
  if (table.getPageCount() <= 1) return null;
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">
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
// DataTable
// ---------------------------------------------------------------------------

export interface DataTableProps<T> {
  /** TanStack column definitions. */
  columns: ColumnDef<T, any>[];
  /** Row data. */
  data: T[];
  /** Accessible table caption (sr-only). */
  caption?: string;
  /** Empty state message when data is empty. */
  emptyMessage?: string;

  // -- Sorting --
  /** Enable sorting. Columns opt in via enableSorting on each column def. */
  sortable?: boolean;
  /** Initial sort state. */
  defaultSort?: SortingState;

  // -- Pagination --
  /** Page size. Omit or set to 0 to disable pagination. */
  pageSize?: number;

  // -- Expandable rows --
  /** Render function for expanded row content. Return null to indicate no detail. */
  expandedContent?: (row: T) => ReactNode | null;

  // -- Row identity --
  /** Get a unique ID for a row (used for expand state and DOM id). Defaults to index. */
  getRowId?: (row: T) => string;

  // -- Mobile --
  /** Render a card for mobile layout. If omitted, the table is used at all sizes. */
  mobileCard?: (row: T) => ReactNode;
  /** Container query breakpoint for switching to desktop. Default: 640px. */
  mobileBreakpoint?: string;

  // -- Styling --
  /** Additional class on the table element. */
  tableClassName?: string;
}

export function DataTable<T>({
  columns,
  data,
  caption,
  emptyMessage = "No data.",
  sortable = false,
  defaultSort = [],
  pageSize = 0,
  expandedContent,
  getRowId,
  mobileCard,
  mobileBreakpoint = "640px",
  tableClassName,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>(defaultSort);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: sortable ? setSorting : undefined,
    enableSortingRemoval: false,
    getCoreRowModel: getCoreRowModel(),
    ...(sortable && { getSortedRowModel: getSortedRowModel() }),
    ...(pageSize > 0 && {
      getPaginationRowModel: getPaginationRowModel(),
      initialState: { pagination: { pageSize } },
    }),
    getRowId: getRowId ? (row) => getRowId(row) : undefined,
  });

  if (data.length === 0) {
    return <EmptyState>{emptyMessage}</EmptyState>;
  }

  const colCount = table.getHeaderGroups()[0]?.headers.length ?? 1;
  const pageRows = table.getRowModel().rows.map((r) => r.original);

  const desktopTable = (
    <Table className={tableClassName}>
      {caption && <caption className="sr-only">{caption}</caption>}
      <TableHeader>
        {table.getHeaderGroups().map((hg) => (
          <TableRow key={hg.id}>
            {hg.headers.map((header) => {
              const canSort = sortable && header.column.getCanSort();
              return (
                <TableHead
                  key={header.id}
                  className={canSort ? "cursor-pointer select-none group" : ""}
                  style={header.getSize() !== 150 ? { width: header.getSize() } : undefined}
                  onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                  title={canSort ? "Sort" : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {canSort && <SortIcon sorted={header.column.getIsSorted()} />}
                  </span>
                </TableHead>
              );
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => {
          const rowId = getRowId ? getRowId(row.original) : row.id;
          const detail = expandedContent?.(row.original);
          const hasDetail = detail !== null && detail !== undefined;
          const expanded = expandedId === rowId;

          return (
            <DesktopRow
              key={rowId}
              row={row}
              rowId={rowId}
              hasDetail={hasDetail}
              expanded={expanded}
              onToggle={() => setExpandedId(expanded ? null : rowId)}
              colCount={colCount}
              detail={expanded ? detail : null}
            />
          );
        })}
      </TableBody>
    </Table>
  );

  if (!mobileCard) {
    return (
      <div className="space-y-4">
        {desktopTable}
        {pageSize > 0 && <Pagination table={table} />}
      </div>
    );
  }

  const bpClass = `@[${mobileBreakpoint}]`;
  return (
    <div className="@container space-y-4">
      <div className={`hidden ${bpClass}:block`}>
        {desktopTable}
      </div>
      <div className={`${bpClass}:hidden`}>
        <div className="space-y-2">
          {pageRows.map((row, i) => (
            <div key={getRowId ? getRowId(row) : i}>
              {mobileCard(row)}
            </div>
          ))}
        </div>
      </div>
      {pageSize > 0 && <Pagination table={table} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Desktop row (handles expand toggle)
// ---------------------------------------------------------------------------

function DesktopRow<T>({
  row,
  rowId,
  hasDetail,
  expanded,
  onToggle,
  colCount,
  detail,
}: {
  row: ReturnType<ReturnType<typeof useReactTable<T>>["getRowModel"]>["rows"][0];
  rowId: string;
  hasDetail: boolean;
  expanded: boolean;
  onToggle: () => void;
  colCount: number;
  detail: ReactNode | null;
}) {
  return (
    <>
      <TableRow
        id={rowId}
        className={`scroll-mt-24 target:bg-accent-subtle ${hasDetail ? "cursor-pointer" : ""}`}
        onClick={hasDetail ? onToggle : undefined}
      >
        {row.getVisibleCells().map((cell) => (
          <TableCell key={cell.id}>
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </TableCell>
        ))}
      </TableRow>
      {expanded && detail && (
        <TableRow>
          <TableCell colSpan={colCount} className="bg-muted/30 px-6 py-4">
            {detail}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
