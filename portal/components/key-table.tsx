"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { KeyActionsBar } from "@/components/key-actions";
import { QuotaEditor } from "@/components/quota-editor";
import { DataTable } from "@/components/ui/data-table";
import { APIKeySpan } from "./ui/api-key-span";

export interface KeyRow {
  id: string;
  displayName: string;
  value: string;
  usageKB: number;
  quotaKB: number | null;
}

const col = createColumnHelper<KeyRow>();

const columns = [
  col.accessor("displayName", {
    header: "Name",
    size: 200,
    cell: ({ getValue }) => <APIKeySpan text={getValue()} />,
  }),
  col.accessor("value", {
    header: "Key",
    size: 200,
    cell: ({ row }) => (
      <span className="font-mono text-sm text-muted-foreground flex gap-2">
        •••• {row.original.value.slice(-4)}
        <KeyActionsBar keyId={row.original.id} keyValue={row.original.value} />
      </span>
    ),
  }),
  col.display({
    id: "quota",
    header: "Usage / Quota",
    size: 300,
    cell: ({ row }) => (
      <QuotaEditor
        keyId={row.original.id}
        usageKB={row.original.usageKB}
        quotaKB={row.original.quotaKB}
      />
    ),
  }),
];

function MobileKeyCard({ row }: { row: KeyRow }) {
  return (
    <div className="rounded-lg border border-border px-4 py-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-medium font-mono text-sm">{row.displayName}</span>
        <KeyActionsBar keyId={row.id} keyValue={row.value} />
      </div>
      <div className="flex items-center justify-between">
        <QuotaEditor keyId={row.id} usageKB={row.usageKB} quotaKB={row.quotaKB} />
      </div>
    </div>
  );
}

export function KeyTable({ keys }: { keys: KeyRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={keys}
      caption="API keys"
      emptyMessage="No API keys yet. Name your first key above to get started."
      getRowId={(row) => row.id}
      mobileCard={(row) => <MobileKeyCard row={row} />}
      tableClassName="table-fixed"
    />
  );
}
