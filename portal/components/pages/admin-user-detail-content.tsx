"use client";

import Link from "next/link";
import { createColumnHelper } from "@tanstack/react-table";
import { AdminUserForm } from "@/components/admin-user-form";
import type { KeyRow } from "@/components/tables/key-table";
import { MetricCard } from "@/components/metric-card";
import { Section } from "@/components/ui/section";
import { DefinitionList } from "@/components/ui/definition-list";
import { DataTable } from "@/components/ui/data-table";
import { Mono } from "@/components/ui/mono";
import { formatKB, formatCurrency } from "@/lib/pure/format";
import { UsageBar } from "@/components/usage-bar";
import type { AdminUserDetail } from "@/lib/data/admin-page-data";

const keyCol = createColumnHelper<KeyRow>();

const adminKeyColumns = [
  keyCol.accessor("id", {
    header: "Key ID",
    cell: ({ getValue }) => <Mono muted>{getValue()}</Mono>,
  }),
  keyCol.display({
    id: "usage",
    header: "Usage / Quota",
    cell: ({ row }) => (
      <UsageBar usageKB={row.original.usageKB} quotaKB={row.original.quotaKB} />
    ),
  }),
];

export function AdminUserDetailContent({ user }: { user: AdminUserDetail }) {
  return (
    <div className="space-y-8">
      <Link
        href="/dashboard/admin/users"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        &larr; All users
      </Link>

      <h1>{user.email}</h1>

      <DefinitionList
        items={[
          { label: "User ID", value: <Mono>{user.id}</Mono> },
          { label: "Joined", value: user.joined || "—" },
          { label: "Stripe", value: <Mono>{user.stripeCustomerId || "—"}</Mono> },
          { label: "Status", value: user.blocked
            ? <span className="font-medium text-destructive">Blocked</span>
            : <span>Active</span>
          },
        ]}
      />

      <div className="grid grid-cols-2 gap-4">
        <MetricCard label="Usage (30 days)" value={formatKB(user.usageKB30d)} />
        <MetricCard label="Total invoiced" value={formatCurrency(user.totalInvoiced)} />
      </div>

      <AdminUserForm user={user} />

      <Section title={`API Keys (${user.keys.length})`}>
        <DataTable
          columns={adminKeyColumns}
          data={user.keys}
          caption="API keys"
          emptyMessage="No API keys."
          getRowId={(row) => row.id}
        />
      </Section>

      {/* TODO: Admin job history — fetched separately via getJobsForUser */}
    </div>
  );
}
