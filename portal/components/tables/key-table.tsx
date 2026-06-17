"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { KeyActionsBar } from "@/components/key-actions";
import { QuotaEditor } from "@/components/quota-editor";
import { DataTable } from "@/components/ui/data-table";
import { TableExport } from "@/components/ui/table-export";
import { formatKB } from "@/lib/pure/format";
import { Mono } from "@/components/ui/mono";

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
    cell: ({ getValue }) => <Mono className="truncate">{getValue()}</Mono>,
  }),
  col.accessor("value", {
    header: "Key",
    size: 200,
    cell: ({ row }) => (
      <Mono muted className="flex gap-2">
        •••• {row.original.value.slice(-4)}
        <KeyActionsBar keyId={row.original.id} keyValue={row.original.value} />
      </Mono>
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
    cell: ({ getValue }) => <Mono className="truncate">{getValue()}</Mono>,
  }),
];

function MobileKeyDetail({ row }: { row: KeyRow }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Mono muted>•••• {row.value.slice(-4)}</Mono>
        <KeyActionsBar keyId={row.id} keyValue={row.value} />
      </div>
      <QuotaEditor keyId={row.id} usageKB={row.usageKB} quotaKB={row.quotaKB} />
    </div>
  );
}

export function keyExportRows(keys: KeyRow[]): { headers: string[]; rows: string[][] } {
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
    <DataTable
      columns={columns}
      data={keys}
      caption="API keys"
      emptyMessage="No API keys yet. Name your first key above to get started."
      actions={<TableExport headers={headers} rows={rows} filenameBase="api-keys" />}
      getRowId={(row) => row.id}
      mobile={{
        columns: mobileKeyColumns,
        expandedContent: (row) => <MobileKeyDetail row={row} />,
      }}
      tableClassName="table-fixed"
    />
  );
}
