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
  const [pricePerUnit, setPricePerUnit] = useState(String(user.pricePerUnit));

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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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

        <label className="space-y-1">
          <span className="text-sm text-muted-foreground">
            Price per unit ($)
          </span>
          <Input
            type="number"
            step="0.001"
            value={pricePerUnit}
            onChange={(e) => setPricePerUnit(e.target.value)}
            className="font-mono"
          />
        </label>

      </div>

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
