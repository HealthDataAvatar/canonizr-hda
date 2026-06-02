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
import { IconButton } from "@/components/ui/icon-button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ActionGroup } from "./action-group";

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

      <ActionGroup>
        <IconButton
          icon={ChevronLeft}
          title="Previous page"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        />
        <span className="text-sm text-muted-foreground">
          Page {table.getState().pagination.pageIndex + 1} of{" "}
          {table.getPageCount()}
        </span>
        <IconButton
          icon={ChevronRight}
          title="Next page"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        />
      </ActionGroup>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DataTable
// ---------------------------------------------------------------------------

export interface MobileLayout<T> {
  /** Column defs for mobile (fewer columns, rest in expandedContent). */
  columns: ColumnDef<T, any>[];
  /** Render function for expanded row content on mobile. */
  expandedContent: (row: T) => ReactNode | null;
  /** Container query breakpoint for switching to desktop. Default: 640px. */
  breakpoint?: string;
}

export interface DataTableProps<T> {
  /** TanStack column definitions. */
  columns: ColumnDef<T, any>[];
  /** Row data. */
  data: T[];
  /** Accessible table caption (sr-only). */
  caption?: string;
  /** Empty state message when data is empty. */
  emptyMessage?: string;

  // -- Actions --
  /** Toolbar rendered above the table (hidden when data is empty). */
  actions?: ReactNode;

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
  /** Mobile layout with separate columns and expanded content. If omitted, the same table is used at all sizes. */
  mobile?: MobileLayout<T>;

  // -- Styling --
  /** Additional class on the table element. */
  tableClassName?: string;
}

export function DataTable<T>({
  columns,
  data,
  caption,
  emptyMessage = "No data.",
  actions,
  sortable = false,
  defaultSort = [],
  pageSize = 0,
  expandedContent,
  getRowId,
  mobile,
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

  const hasExpand = !!expandedContent;
  const colCount = (table.getHeaderGroups()[0]?.headers.length ?? 1) + (hasExpand ? 1 : 0);
  const pageRows = table.getRowModel().rows.map((r) => r.original);

  const desktopTable = (
    <Table className={tableClassName}>
      {caption && <caption className="sr-only">{caption}</caption>}
      <TableHeader>
        {table.getHeaderGroups().map((hg) => (
          <TableRow key={hg.id}>
            {hasExpand && <TableHead className="w-8" />}
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
              hasExpand={hasExpand}
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

  const actionsBar = actions ? (
    <div className="flex justify-end">{actions}</div>
  ) : null;

  if (!mobile) {
    return (
      <div className="space-y-4">
        {actionsBar}
        {desktopTable}
        {pageSize > 0 && <Pagination table={table} />}
      </div>
    );
  }

  const bp = mobile.breakpoint ?? "640px";
  // Static class names so Tailwind JIT can detect them at build time.
  const show = bp === "480px" ? "hidden @[480px]:block" : "hidden @[640px]:block";
  const hide = bp === "480px" ? "@[480px]:hidden" : "@[640px]:hidden";
  return (
    <div className="@container space-y-4">
      {actionsBar}
      <div className={show}>
        {desktopTable}
      </div>
      <div className={hide}>
        <MobileTable
          columns={mobile.columns}
          data={pageRows}
          expandedContent={mobile.expandedContent}
          getRowId={getRowId}
          sortable={sortable}
          defaultSort={defaultSort}
          tableClassName={tableClassName}
        />
      </div>
      {pageSize > 0 && <Pagination table={table} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile table (fewer columns, same expand behavior)
// ---------------------------------------------------------------------------

function MobileTable<T>({
  columns,
  data,
  expandedContent,
  getRowId,
  sortable,
  defaultSort,
  tableClassName,
}: {
  columns: ColumnDef<T, any>[];
  data: T[];
  expandedContent?: (row: T) => ReactNode | null;
  getRowId?: (row: T) => string;
  sortable: boolean;
  defaultSort: SortingState;
  tableClassName?: string;
}) {
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
    getRowId: getRowId ? (row) => getRowId(row) : undefined,
  });

  const hasExpand = !!expandedContent;
  const colCount = (table.getHeaderGroups()[0]?.headers.length ?? 1) + (hasExpand ? 1 : 0);

  return (
    <Table className={tableClassName}>
      <TableHeader>
        {table.getHeaderGroups().map((hg) => (
          <TableRow key={hg.id}>
            {hasExpand && <TableHead className="w-8" />}
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
              hasExpand={hasExpand}
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
}

// ---------------------------------------------------------------------------
// Desktop row (handles expand toggle)
// ---------------------------------------------------------------------------

function DesktopRow<T>({
  row,
  rowId,
  hasExpand,
  hasDetail,
  expanded,
  onToggle,
  colCount,
  detail,
}: {
  row: ReturnType<ReturnType<typeof useReactTable<T>>["getRowModel"]>["rows"][0];
  rowId: string;
  hasExpand: boolean;
  hasDetail: boolean;
  expanded: boolean;
  onToggle: () => void;
  colCount: number;
  detail: ReactNode | null;
}) {
  return (
    <>
      <TableRow id={rowId} className="scroll-mt-24 target:bg-accent-subtle">
        {hasExpand && (
          <TableCell className="w-8 px-2">
            {hasDetail && (
              <IconButton
                icon={ChevronRight}
                title={expanded ? "Collapse row" : "Expand row"}
                aria-expanded={expanded}
                onClick={onToggle}
                className={expanded ? "rotate-90" : ""}
              />
            )}
          </TableCell>
        )}
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
