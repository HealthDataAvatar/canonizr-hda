"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { createColumnHelper } from "@tanstack/react-table";
import { timeAgo } from "@/lib/pure/time";
import { formatKB, formatCurrency } from "@/lib/pure/format";
import { Mono } from "@/components/ui/mono";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/ui/data-table";
import type { AdminUserRow } from "@/lib/data/admin-page-data";

// ---------------------------------------------------------------------------
// Expanded detail (click-to-fetch spend)
// ---------------------------------------------------------------------------

function ExpandedUserDetail({ user }: { user: AdminUserRow }) {
  const [spend, setSpend] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchSpend = useCallback(() => {
    if (!user.stripeCustomerId) {
      setSpend(0);
      return;
    }
    setLoading(true);
    fetch(`/api/admin/users/${user.stripeCustomerId}/spend`)
      .then((r) => r.json())
      .then((d) => setSpend(d.totalInvoiced ?? 0))
      .catch(() => setSpend(0))
      .finally(() => setLoading(false));
  }, [user.stripeCustomerId]);

  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm max-w-lg">
      <span className="text-muted-foreground">User ID</span>
      <Mono>{user.id}</Mono>
      <span className="text-muted-foreground">Stripe</span>
      <Mono>{user.stripeCustomerId || "—"}</Mono>
      <span className="text-muted-foreground">Total invoiced</span>
      <span>
        {spend != null ? (
          <Mono>{formatCurrency(spend)}</Mono>
        ) : (
          <button
            type="button"
            className="text-sm text-accent hover:underline"
            onClick={fetchSpend}
            disabled={loading}
          >
            {loading ? "Loading…" : "Fetch spend"}
          </button>
        )}
      </span>
      <span className="text-muted-foreground">Errors (30d)</span>
      <span className={user.errorCount30d > 0 ? "text-destructive font-medium" : ""}>
        {user.errorCount30d}
      </span>
      <div className="col-span-2 mt-1">
        <Link
          href={`/dashboard/admin/users/${user.id}`}
          className="text-sm text-accent hover:underline"
        >
          Full profile &rarr;
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

const col = createColumnHelper<AdminUserRow>();

const columns = [
  col.accessor("email", {
    header: "Email",
    cell: ({ row }) => (
      <Link
        href={`/dashboard/admin/users/${row.original.id}`}
        className="text-accent hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        <Mono>{row.original.email}</Mono>
      </Link>
    ),
  }),
  col.accessor("keyCount", {
    header: "Keys",
    size: 60,
    cell: ({ getValue }) => <Mono muted>{getValue()}</Mono>,
  }),
  col.accessor("jobCount30d", {
    header: "Jobs (30d)",
    size: 100,
    cell: ({ row }) => (
      <Mono muted>
        {row.original.jobCount30d}
        {row.original.errorCount30d > 0 && (
          <span className="ml-1 text-destructive">
            ({row.original.errorCount30d} err)
          </span>
        )}
      </Mono>
    ),
  }),
  col.accessor("usageKB30d", {
    header: "Usage (30d)",
    size: 100,
    cell: ({ getValue }) => <Mono muted>{formatKB(getValue())}</Mono>,
  }),
  col.accessor("blocked", {
    header: "Status",
    size: 80,
    cell: ({ getValue }) =>
      getValue() ? (
        <span className="text-sm font-medium text-destructive">Blocked</span>
      ) : (
        <span className="text-sm text-muted-foreground">Active</span>
      ),
  }),
  col.accessor("joined", {
    header: "Joined",
    size: 100,
    cell: ({ getValue }) => <Mono muted>{getValue() ? timeAgo(getValue()) : "—"}</Mono>,
  }),
];

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export function AdminUserSearch({ users }: { users: AdminUserRow[] }) {
  const [query, setQuery] = useState("");
  const lc = query.toLowerCase();
  const filtered = query
    ? users.filter(
        (u) =>
          u.email.toLowerCase().includes(lc) ||
          u.id.toLowerCase().includes(lc),
      )
    : users;

  return (
    <div className="space-y-4">
      <Input
        type="text"
        placeholder="Search by email or user ID"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="max-w-md"
      />

      <DataTable
        columns={columns}
        data={filtered}
        caption="Users"
        emptyMessage={query ? "No users match that search." : "No users yet."}
        getRowId={(row) => row.id}
        expandedContent={(row) => <ExpandedUserDetail user={row} />}
      />
    </div>
  );
}
