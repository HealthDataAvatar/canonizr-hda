"use client";

import { Button } from "@/components/ui/button";
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
  createdDate: string;
  lastUsed: string;
  usageKB: number;
  quotaKB: number | null;
}

export function KeyTable({
  keys,
  onRotate,
  onDelete,
}: {
  keys: KeyRow[];
  onRotate?: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  if (keys.length === 0) {
    return (
      <p className="py-8 text-center text-[0.9375rem] text-muted-foreground">
        No API keys yet. Name your first key above to get started.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Last used</TableHead>
          <TableHead>Usage / Quota</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {keys.map((key) => (
          <TableRow key={key.id}>
            <TableCell className="font-medium font-mono text-[0.875rem]">
              {key.displayName}
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
            <TableCell className="text-right">
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onRotate?.(key.id)}
                >
                  Rotate
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => onDelete?.(key.id)}
                >
                  Delete
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
