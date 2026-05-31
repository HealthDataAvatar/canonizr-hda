"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { timeAgo } from "@/lib/pure/time";
import { formatKB } from "@/lib/pure/format";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AdminUserRow } from "@/lib/data/admin-page-data";

function ExpandedRow({ user }: { user: AdminUserRow }) {
  const [spend, setSpend] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useState(() => {
    if (!user.stripeCustomerId) {
      setSpend(0);
      setLoading(false);
      return;
    }
    fetch(`/api/admin/users/${user.stripeCustomerId}/spend`)
      .then((r) => r.json())
      .then((d) => setSpend(d.totalInvoiced ?? 0))
      .catch(() => setSpend(0))
      .finally(() => setLoading(false));
  });

  return (
    <TableRow>
      <TableCell colSpan={7} className="bg-muted/30 px-6 py-4">
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm max-w-lg">
          <span className="text-muted-foreground">User ID</span>
          <span className="font-mono text-sm">{user.id}</span>
          <span className="text-muted-foreground">Stripe</span>
          <span className="font-mono text-sm">
            {user.stripeCustomerId || "—"}
          </span>
          <span className="text-muted-foreground">Total invoiced</span>
          <span className="font-mono">
            {loading ? "…" : `$${spend!.toFixed(2)}`}
          </span>
          <span className="text-muted-foreground">Errors (30d)</span>
          <span className={user.errorCount30d > 0 ? "text-destructive font-medium" : ""}>
            {user.errorCount30d}
          </span>
        </div>
        <div className="mt-3">
          <Link
            href={`/dashboard/admin/users/${user.id}`}
            className="text-sm text-accent hover:underline"
          >
            Full profile &rarr;
          </Link>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function AdminUserSearch({ users }: { users: AdminUserRow[] }) {
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const lc = query.toLowerCase();
  const filtered = query
    ? users.filter(
        (u) =>
          u.email.toLowerCase().includes(lc) ||
          u.id.toLowerCase().includes(lc)
      )
    : users;

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  return (
    <>
      <Input
        type="text"
        placeholder="Search by email or user ID"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="max-w-md"
      />

      {filtered.length === 0 ? (
        <EmptyState>
          {query ? "No users match that search." : "No users yet."}
        </EmptyState>
      ) : (
        <Table>
          <caption className="sr-only">Users</caption>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Email</TableHead>
              <TableHead>Keys</TableHead>
              <TableHead>Jobs (30d)</TableHead>
              <TableHead>Usage (30d)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((user) => {
              const expanded = expandedId === user.id;
              return (
                <>
                  <TableRow
                    key={user.id}
                    className="cursor-pointer"
                    onClick={() => toggleExpand(user.id)}
                  >
                    <TableCell className="w-8 text-muted-foreground">
                      {expanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/dashboard/admin/users/${user.id}`}
                        className="font-mono text-sm text-accent hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {user.email}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {user.keyCount}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {user.jobCount30d}
                      {user.errorCount30d > 0 && (
                        <span className="ml-1 text-destructive">
                          ({user.errorCount30d} err)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {formatKB(user.usageKB30d)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {user.blocked ? (
                        <span className="font-medium text-destructive">Blocked</span>
                      ) : (
                        <span className="text-muted-foreground">Active</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {user.joined ? timeAgo(user.joined) : "—"}
                    </TableCell>
                  </TableRow>
                  {expanded && <ExpandedRow key={`${user.id}-detail`} user={user} />}
                </>
              );
            })}
          </TableBody>
        </Table>
      )}
    </>
  );
}
