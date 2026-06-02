"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { ExternalLink, Check, Circle } from "lucide-react";
import { formatKB } from "@/lib/pure/format";
import { IconHint } from "@/components/ui/icon-hint";
import { IconLink } from "@/components/ui/icon-link";
import { DataTable } from "@/components/ui/data-table";

export interface InvoiceRow {
  id: string;
  date: string;
  processedKB: number;
  amount: number;
  status: string;
  url: string | null;
}

function StatusIndicator({ status }: { status: string }) {
  if (status === "paid") return <IconHint icon={Check} title="Paid" />;
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

const columns = [
  col.accessor("date", {
    header: "Period",
    cell: ({ getValue }) => <span className="text-sm">{formatMonth(getValue())}</span>,
  }),
  col.accessor("processedKB", {
    header: "Processed",
    cell: ({ getValue }) => <span className="font-mono text-sm">{formatKB(getValue())}</span>,
  }),
  col.accessor("amount", {
    header: "Amount",
    cell: ({ getValue }) => <span className="font-mono text-sm">${getValue().toFixed(2)}</span>,
  }),
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
  col.accessor("date", {
    header: "Period",
    cell: ({ getValue }) => <span className="text-sm">{formatMonth(getValue())}</span>,
  }),
  col.accessor("amount", {
    header: "Amount",
    cell: ({ getValue }) => <span className="font-mono text-sm">${getValue().toFixed(2)}</span>,
  }),
  col.accessor("status", {
    header: "",
    size: 40,
    cell: ({ getValue }) => <StatusIndicator status={getValue()} />,
  }),
];

function MobileInvoiceDetail({ row }: { row: InvoiceRow }) {
  return (
    <div className="flex items-center gap-4 text-sm">
      <span className="text-muted-foreground">Processed: <span className="font-mono">{formatKB(row.processedKB)}</span></span>
      <InvoiceLink url={row.url} />
    </div>
  );
}

export function InvoiceTable({ invoices }: { invoices: InvoiceRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={invoices}
      caption="Invoice history"
      emptyMessage="No invoices yet."
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
