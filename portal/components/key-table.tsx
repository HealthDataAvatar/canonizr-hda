"use client";

import { KeyActions } from "@/components/key-actions";
import { UsageBar } from "@/components/usage-bar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface KeyRow {
  id: string;
  displayName: string;
  keyHint: string;
  createdDate: string;
  lastUsed: string;
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
          <TableHead className="w-2/12"></TableHead>
          <TableHead className="w-2/12">Key</TableHead>
          <TableHead className="w-2/12">Created</TableHead>
          <TableHead className="w-2/12">Last used</TableHead>
          <TableHead className="w-3/12">Usage / Quota</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {keys.map((key) => (
          <TableRow key={key.id}>
            <TableCell className="font-medium font-mono text-[0.875rem]">
              {key.displayName}
            </TableCell>
            <TableCell>
              <KeyActions keyId={key.id} />
            </TableCell>
            <TableCell className="font-mono text-[0.8125rem] text-muted-foreground">
              •••• {key.keyHint}
            </TableCell>
            <TableCell className="text-[0.8125rem] text-muted-foreground">
              {key.createdDate}
            </TableCell>
            <TableCell className="text-[0.8125rem] text-muted-foreground">
              {key.lastUsed}
            </TableCell>
            <TableCell>
              <UsageBar usageKB={key.usageKB} quotaKB={key.quotaKB} />
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
            <KeyActions keyId={key.id} />
          </div>
          <div className="flex items-center justify-between text-[0.8125rem] text-muted-foreground">
            <span className="font-mono">•••• {key.keyHint}</span>
            <span>{key.createdDate}</span>
          </div>
          <UsageBar usageKB={key.usageKB} quotaKB={key.quotaKB} />
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
