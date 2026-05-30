"use client";

import { useState } from "react";
import Link from "next/link";
import { timeAgo } from "@/lib/pure/time";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AdminUserRow } from "@/lib/data/admin-data";

export function AdminUserSearch({ users }: { users: AdminUserRow[] }) {
  const [query, setQuery] = useState("");
  const lc = query.toLowerCase();
  const filtered = query
    ? users.filter(
        (u) =>
          u.email.toLowerCase().includes(lc) ||
          u.id.toLowerCase().includes(lc)
      )
    : users;

  return (
    <>
      <input
        type="text"
        placeholder="Search by email or user ID"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full max-w-md rounded-md border border-border bg-background px-3 py-2 text-[0.9375rem] placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-[0.9375rem] text-muted-foreground">
          {query ? "No users match that search." : "No users yet."}
        </p>
      ) : (
        <Table>
          <caption className="sr-only">Users</caption>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Keys</TableHead>
              <TableHead>Jobs (30d)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <Link
                    href={`/dashboard/admin/users/${user.id}`}
                    className="font-mono text-[0.875rem] text-accent hover:underline"
                  >
                    {user.email}
                  </Link>
                </TableCell>
                <TableCell className="text-[0.875rem] text-muted-foreground">
                  {user.keyCount}
                </TableCell>
                <TableCell className="text-[0.875rem] text-muted-foreground">
                  {user.jobCount30d}
                </TableCell>
                <TableCell className="text-[0.875rem]">
                  {user.blocked ? (
                    <span className="font-medium text-destructive">Blocked</span>
                  ) : (
                    <span className="text-muted-foreground">Active</span>
                  )}
                </TableCell>
                <TableCell className="text-[0.8125rem] text-muted-foreground">
                  {user.joined ? timeAgo(user.joined) : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
