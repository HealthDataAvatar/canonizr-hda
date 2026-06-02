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

function MobileInvoiceCard({ row }: { row: InvoiceRow }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
      <span className="text-sm">{formatMonth(row.date)}</span>
      <div className="flex items-center gap-3">
        <span className="font-mono text-sm">${row.amount.toFixed(2)}</span>
        <StatusIndicator status={row.status} />
        <InvoiceLink url={row.url} />
      </div>
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
      mobileCard={(row) => <MobileInvoiceCard row={row} />}
      mobileBreakpoint="480px"
    />
  );
}
