import Link from "next/link";
import { AdminUserForm } from "@/components/admin-user-form";
import { RequestTable } from "@/components/tables/request-table";
import { MetricCard } from "@/components/metric-card";
import { Section } from "@/components/ui/section";
import { DefinitionList } from "@/components/ui/definition-list";
import { formatKB } from "@/lib/pure/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UsageBar } from "@/components/usage-bar";
import type { AdminUserDetail } from "@/lib/data/admin-page-data";

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
          { label: "User ID", value: <span className="font-mono text-sm">{user.id}</span> },
          { label: "Joined", value: user.joined || "—" },
          { label: "Stripe", value: <span className="font-mono text-sm">{user.stripeCustomerId || "—"}</span> },
          { label: "Status", value: user.blocked
            ? <span className="font-medium text-destructive">Blocked</span>
            : <span>Active</span>
          },
        ]}
      />

      <div className="grid grid-cols-2 gap-4">
        <MetricCard label="Usage (30 days)" value={formatKB(user.usageKB30d)} />
        <MetricCard label="Total invoiced" value={`$${user.totalInvoiced.toFixed(2)}`} />
      </div>

      <AdminUserForm user={user} />

      {user.keys.length > 0 && (
        <Section title={`API Keys (${user.keys.length})`}>
          <Table>
            <caption className="sr-only">API keys</caption>
            <TableHeader>
              <TableRow>
                <TableHead>Key ID</TableHead>
                <TableHead>Usage / Quota</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {user.keys.map((key) => (
                <TableRow key={key.id}>
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {key.id}
                  </TableCell>
                  <TableCell>
                    <UsageBar usageKB={key.usageKB} quotaKB={key.quotaKB} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
      )}

      {user.recentJobs.length > 0 && (
        <Section title={`Recent jobs (${user.recentJobs.length})`}>
          <RequestTable requests={user.recentJobs} />
        </Section>
      )}
    </div>
  );
}
