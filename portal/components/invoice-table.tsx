"use client";

import { useState } from "react";
import { ExternalLink, Check, Circle, ChevronLeft, ChevronRight } from "lucide-react";
import { formatKB } from "@/lib/format";
import { IconHint } from "@/components/ui/icon-hint";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title="View invoice"
      className="rounded-md text-muted-foreground hover:text-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ExternalLink className="size-4" />
    </a>
  );
}

function formatMonth(date: string): string {
  return new Date(date).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
  });
}

const PAGE_SIZE = 12;

function DesktopInvoiceTable({ invoices }: { invoices: InvoiceRow[] }) {
  return (
    <Table>
      <caption className="sr-only">Invoice history</caption>
      <TableHeader>
        <TableRow>
          <TableHead>Period</TableHead>
          <TableHead>Processed</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Status</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invoices.map((inv) => (
          <TableRow key={inv.id}>
            <TableCell className="text-[0.875rem]">
              {formatMonth(inv.date)}
            </TableCell>
            <TableCell className="font-mono text-[0.875rem]">
              {formatKB(inv.processedKB)}
            </TableCell>
            <TableCell className="font-mono text-[0.875rem]">
              ${inv.amount.toFixed(2)}
            </TableCell>
            <TableCell>
              <StatusIndicator status={inv.status} />
            </TableCell>
            <TableCell>
              <InvoiceLink url={inv.url} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function MobileInvoiceList({ invoices }: { invoices: InvoiceRow[] }) {
  return (
    <div className="space-y-2">
      {invoices.map((inv) => (
        <div
          key={inv.id}
          className="flex items-center justify-between rounded-lg border border-border px-4 py-3"
        >
          <span className="text-[0.875rem]">
            {formatMonth(inv.date)}
          </span>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[0.875rem]">
              ${inv.amount.toFixed(2)}
            </span>
            <StatusIndicator status={inv.status} />
            <InvoiceLink url={inv.url} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function InvoiceTable({ invoices }: { invoices: InvoiceRow[] }) {
  const [page, setPage] = useState(0);

  if (invoices.length === 0) {
    return (
      <p className="py-8 text-center text-[0.9375rem] text-muted-foreground">
        No invoices yet.
      </p>
    );
  }

  const pageCount = Math.ceil(invoices.length / PAGE_SIZE);
  const visible = invoices.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="@container space-y-4">
      <div className="hidden @[480px]:block">
        <DesktopInvoiceTable invoices={visible} />
      </div>
      <div className="@[480px]:hidden">
        <MobileInvoiceList invoices={visible} />
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-[0.8125rem] text-muted-foreground">
            Page {page + 1} of {pageCount}
          </p>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 0}
              title="Previous page"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= pageCount - 1}
              title="Next page"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
