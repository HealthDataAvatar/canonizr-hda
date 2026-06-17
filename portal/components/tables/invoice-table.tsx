"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { ExternalLink, Circle } from "lucide-react";
import { Success } from "@/components/ui/icons";
import { formatKB, formatCurrency } from "@/lib/pure/format";
import { IconHint } from "@/components/ui/icon-hint";
import { IconLink } from "@/components/ui/icon-link";
import { Mono } from "@/components/ui/mono";
import { DataTable } from "@/components/ui/data-table";
import { TableExport } from "@/components/ui/table-export";

export interface InvoiceRow {
  id: string;
  date: string;
  processedKB: number;
  amount: number;
  status: string;
  url: string | null;
}

function StatusIndicator({ status }: { status: string }) {
  if (status === "paid") return <IconHint icon={Success} title="Paid" />;
  return <IconHint icon={Circle} title="Not yet paid" />;
}

function InvoiceLink({ url }: { url: string | null }) {
  if (!url) return null;
  return (
    <IconLink
      icon={ExternalLink}
      title="View invoice"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
    />
  );
}

function formatMonth(date: string): string {
  return new Date(date).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
  });
}

const col = createColumnHelper<InvoiceRow>();

// Shared columns (used in both desktop and mobile layouts)
const dateCol = col.accessor("date", {
  header: "Period",
  cell: ({ getValue }) => <span className="text-sm">{formatMonth(getValue())}</span>,
});

const amountCol = col.accessor("amount", {
  header: "Amount",
  cell: ({ getValue }) => <Mono>{formatCurrency(getValue())}</Mono>,
});

const columns = [
  dateCol,
  col.accessor("processedKB", {
    header: "Processed",
    cell: ({ getValue }) => <Mono>{formatKB(getValue())}</Mono>,
  }),
  amountCol,
  col.accessor("status", {
    header: "Status",
    cell: ({ getValue }) => <StatusIndicator status={getValue()} />,
  }),
  col.display({
    id: "link",
    header: "",
    cell: ({ row }) => <InvoiceLink url={row.original.url} />,
  }),
];

const mobileInvoiceColumns = [
  dateCol,
  amountCol,
  col.accessor("status", {
    header: "",
    size: 40,
    cell: ({ getValue }) => <StatusIndicator status={getValue()} />,
  }),
];

function MobileInvoiceDetail({ row }: { row: InvoiceRow }) {
  return (
    <div className="flex items-center gap-4 text-sm">
      <span className="text-muted-foreground">Processed: <Mono>{formatKB(row.processedKB)}</Mono></span>
      <InvoiceLink url={row.url} />
    </div>
  );
}

export function invoiceExportRows(invoices: InvoiceRow[]): { headers: string[]; rows: string[][] } {
  const headers = ["Period", "Processed", "Amount", "Status"];
  const rows = invoices.map((inv) => [
    formatMonth(inv.date),
    formatKB(inv.processedKB),
    formatCurrency(inv.amount),
    inv.status,
  ]);
  return { headers, rows };
}

export function InvoiceTable({ invoices }: { invoices: InvoiceRow[] }) {
  const { headers, rows } = invoiceExportRows(invoices);
  return (
    <DataTable
      columns={columns}
      data={invoices}
      caption="Invoice history"
      emptyMessage="No invoices yet."
      actions={<TableExport headers={headers} rows={rows} filenameBase="invoices" />}
      pageSize={12}
      getRowId={(row) => row.id}
      mobile={{
        columns: mobileInvoiceColumns,
        expandedContent: (row) => <MobileInvoiceDetail row={row} />,
        breakpoint: "480px",
      }}
    />
  );
}
