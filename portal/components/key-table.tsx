"use client";

import { KeyActions } from "@/components/key-actions";
import { QuotaEditor } from "@/components/quota-editor";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { APIKeySpan } from "./ui/api-key-span";

export interface KeyRow {
  id: string;
  displayName: string;
  value: string;
  usageKB: number;
  quotaKB: number | null;
}

function DesktopKeyTable({ keys }: { keys: KeyRow[] }) {
  return (
    <Table className="table-fixed">
      <caption className="sr-only">API keys</caption>
      <TableHeader>
        <TableRow>
          <TableHead className="w-3/12">Name</TableHead>
          <TableHead className="w-3/12">Key</TableHead>
          <TableHead className="w-4/12">Usage / Quota</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {keys.map((key) => (
          <TableRow key={key.id}>
            <TableCell className="text-[0.875rem]">
              <APIKeySpan text={key.displayName} />
            </TableCell>
            <TableCell className="font-mono text-[0.8125rem] text-muted-foreground flex gap-2">
              •••• {key.value.slice(-4)}
              <KeyActions keyId={key.id} keyValue={key.value} />
            </TableCell>
            <TableCell>
              <QuotaEditor keyId={key.id} usageKB={key.usageKB} quotaKB={key.quotaKB} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function MobileKeyList({ keys }: { keys: KeyRow[] }) {
  return (
    <div className="space-y-2">
      {keys.map((key) => (
        <div
          key={key.id}
          className="rounded-lg border border-border px-4 py-3 space-y-2"
        >
          <div className="flex items-center justify-between">
            <span className="font-medium font-mono text-[0.875rem]">
              {key.displayName}
            </span>
            <KeyActions keyId={key.id} keyValue={key.value} />
          </div>
          <span className="font-mono text-[0.8125rem] text-muted-foreground">
            •••• {key.value}
          </span>
          <QuotaEditor keyId={key.id} usageKB={key.usageKB} quotaKB={key.quotaKB} />
        </div>
      ))}
    </div>
  );
}

export function KeyTable({ keys }: { keys: KeyRow[] }) {
  if (keys.length === 0) {
    return (
      <p className="py-8 text-center text-[0.9375rem] text-muted-foreground">
        No API keys yet. Name your first key above to get started.
      </p>
    );
  }

  return (
    <div className="@container">
      <div className="hidden @[640px]:block">
        <DesktopKeyTable keys={keys} />
      </div>
      <div className="@[640px]:hidden">
        <MobileKeyList keys={keys} />
      </div>
    </div>
  );
}
