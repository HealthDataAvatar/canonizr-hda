"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { KeyActionsBar } from "@/components/key-actions";
import { QuotaEditor } from "@/components/quota-editor";
import { DataTable } from "@/components/ui/data-table";
import { TableExport } from "@/components/ui/table-export";
import { formatKB } from "@/lib/pure/format";
import { APIKeySpan } from "../ui/api-key-span";

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

const mobileKeyColumns = [
  col.accessor("displayName", {
    header: "Name",
    cell: ({ getValue }) => <APIKeySpan text={getValue()} />,
  }),
];

function MobileKeyDetail({ row }: { row: KeyRow }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm text-muted-foreground">
          •••• {row.value.slice(-4)}
        </span>
        <KeyActionsBar keyId={row.id} keyValue={row.value} />
      </div>
      <QuotaEditor keyId={row.id} usageKB={row.usageKB} quotaKB={row.quotaKB} />
    </div>
  );
}

function keyExportRows(keys: KeyRow[]): { headers: string[]; rows: string[][] } {
  const headers = ["Name", "Usage", "Quota"];
  const rows = keys.map((k) => [
    k.displayName,
    formatKB(k.usageKB),
    k.quotaKB != null ? formatKB(k.quotaKB) : "No limit",
  ]);
  return { headers, rows };
}

export function KeyTable({ keys }: { keys: KeyRow[] }) {
  const { headers, rows } = keyExportRows(keys);
  return (
    <div className="space-y-2">
      {keys.length > 0 && (
        <div className="flex justify-end">
          <TableExport headers={headers} rows={rows} filenameBase="api-keys" />
        </div>
      )}
      <DataTable
        columns={columns}
        data={keys}
        caption="API keys"
        emptyMessage="No API keys yet. Name your first key above to get started."
        getRowId={(row) => row.id}
        mobile={{
          columns: mobileKeyColumns,
          expandedContent: (row) => <MobileKeyDetail row={row} />,
        }}
        tableClassName="table-fixed"
      />
    </div>
  );
}
