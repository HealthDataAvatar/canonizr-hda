import { notFound } from "next/navigation";
import Link from "next/link";
import { getUserDetail } from "@/lib/data/admin-page-data";
import { AdminUserForm } from "@/components/admin-user-form";
import { RequestTable } from "@/components/request-table";
import { MetricCard } from "@/components/metric-card";
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

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getUserDetail(id);
  if (!user) notFound();

  return (
    <div className="space-y-8">
      <Link
        href="/dashboard/admin/users"
        className="text-[0.875rem] text-muted-foreground hover:text-foreground"
      >
        &larr; All users
      </Link>

      <h1 className="text-[1.5rem] font-semibold">{user.email}</h1>

      {/* Identity */}
      <section className="space-y-2">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-[0.9375rem]">
          <dt className="text-muted-foreground">User ID</dt>
          <dd className="font-mono text-[0.875rem]">{user.id}</dd>
          <dt className="text-muted-foreground">Joined</dt>
          <dd>{user.joined || "—"}</dd>
          <dt className="text-muted-foreground">Stripe</dt>
          <dd className="font-mono text-[0.875rem]">
            {user.stripeCustomerId || "—"}
          </dd>
          <dt className="text-muted-foreground">Status</dt>
          <dd>
            {user.blocked ? (
              <span className="font-medium text-destructive">Blocked</span>
            ) : (
              <span>Active</span>
            )}
          </dd>
        </dl>
      </section>

      {/* Usage + billing summary */}
      <section className="grid grid-cols-2 gap-4">
        <MetricCard label="Usage (7 days)" value={formatKB(user.usageLast7dKB)} />
        <MetricCard label="Total invoiced" value={`$${user.totalInvoiced.toFixed(2)}`} />
      </section>

      {/* Editable plan + actions */}
      <AdminUserForm user={user} />

      {/* Keys */}
      {user.keys.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-[1.125rem] font-semibold">
            API Keys ({user.keys.length})
          </h2>
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
                  <TableCell className="font-mono text-[0.8125rem] text-muted-foreground">
                    {key.id}
                  </TableCell>
                  <TableCell>
                    <UsageBar usageKB={key.usageKB} quotaKB={key.quotaKB} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}

      {/* Recent jobs */}
      {user.recentJobs.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-[1.125rem] font-semibold">
            Recent jobs ({user.recentJobs.length})
          </h2>
          <RequestTable requests={user.recentJobs} />
        </section>
      )}
    </div>
  );
}
