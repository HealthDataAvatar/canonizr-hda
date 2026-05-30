"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { AdminUserDetail } from "@/lib/data/admin-page-data";

export function AdminUserForm({ user }: { user: AdminUserDetail }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [freeUnits, setFreeUnits] = useState(String(user.freeUnits ?? ""));
  const [maxKeys, setMaxKeys] = useState(String(user.maxKeys));
  const [pricePerUnit, setPricePerUnit] = useState(String(user.pricePerUnit));
  const [notes, setNotes] = useState(user.notes);

  async function handleSave() {
    setSaving(true);
    try {
      await fetch(`/api/admin/users/${user.id}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          freeUnits: freeUnits === "" ? null : Number(freeUnits),
          maxKeys: Number(maxKeys),
          pricePerUnit: Number(pricePerUnit),
          notes,
        }),
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleBlock() {
    setBlocking(true);
    try {
      const action = user.blocked ? "unblock" : "block";
      await fetch(`/api/admin/users/${user.id}/${action}`, { method: "POST" });
      router.refresh();
    } finally {
      setBlocking(false);
    }
  }

  return (
    <section className="space-y-6">
      <h2 className="text-[1.125rem] font-semibold">Plan</h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="space-y-1">
          <span className="text-[0.875rem] text-muted-foreground">
            Free units
          </span>
          <input
            type="number"
            value={freeUnits}
            onChange={(e) => setFreeUnits(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-[0.875rem] focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </label>

        <label className="space-y-1">
          <span className="text-[0.875rem] text-muted-foreground">
            Max keys
          </span>
          <input
            type="number"
            value={maxKeys}
            onChange={(e) => setMaxKeys(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-[0.875rem] focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </label>

        <label className="space-y-1">
          <span className="text-[0.875rem] text-muted-foreground">
            Price per unit ($)
          </span>
          <input
            type="number"
            step="0.001"
            value={pricePerUnit}
            onChange={(e) => setPricePerUnit(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-[0.875rem] focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-[0.875rem] text-muted-foreground">Notes</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-[0.9375rem] focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </label>

      <div className="flex gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save changes"}
        </Button>

        <Button
          variant={user.blocked ? "outline" : "destructive"}
          onClick={handleToggleBlock}
          disabled={blocking}
        >
          {blocking
            ? "..."
            : user.blocked
              ? "Unblock user"
              : "Block user"}
        </Button>
      </div>
    </section>
  );
}
