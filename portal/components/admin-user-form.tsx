"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AdminUserDetail } from "@/lib/data/admin-page-data";

export function AdminUserForm({ user }: { user: AdminUserDetail }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [freeUnits, setFreeUnits] = useState(String(user.freeUnits ?? ""));
  const [maxKeys, setMaxKeys] = useState(String(user.maxKeys));
  const [comp, setComp] = useState(user.comp);

  async function handleSave() {
    setSaving(true);
    try {
      await fetch(`/api/admin/users/${user.id}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          freeUnits: freeUnits === "" ? null : Number(freeUnits),
          maxKeys: Number(maxKeys),
          comp,
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
      <h2>Plan</h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-sm text-muted-foreground">
            Free units
          </span>
          <Input
            type="number"
            value={freeUnits}
            onChange={(e) => setFreeUnits(e.target.value)}
            className="font-mono"
          />
        </label>

        <label className="space-y-1">
          <span className="text-sm text-muted-foreground">
            Max keys
          </span>
          <Input
            type="number"
            value={maxKeys}
            onChange={(e) => setMaxKeys(e.target.value)}
            className="font-mono"
          />
        </label>

      </div>

      <label className="flex items-start gap-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
        <input
          type="checkbox"
          checked={comp}
          onChange={(e) => setComp(e.target.checked)}
          className="mt-1"
        />
        <span className="space-y-0.5">
          <span className="block text-sm font-medium">
            Comp account — never charged{comp ? " ✓" : ""}
          </span>
          <span className="block text-sm text-muted-foreground">
            Truly unlimited usage, never metered to Stripe. Usage is still recorded.
            Save to apply.
          </span>
        </span>
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
