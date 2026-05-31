"use client";

import { useState, useRef, useEffect } from "react";
import { Pencil, Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { IconButton } from "@/components/ui/icon-button";
import { UsageBar } from "@/components/usage-bar";

export interface QuotaEditorProps {
  keyId: string;
  usageKB: number;
  quotaKB: number | null;
}

type Unit = "MB" | "GB";

function kbToDisplay(kb: number): { value: number; unit: Unit } {
  if (kb >= 1_000_000) return { value: Math.round(kb / 1_000_000), unit: "GB" };
  return { value: Math.round(kb / 1_000), unit: "MB" };
}

function displayToKB(value: number, unit: Unit): number {
  return unit === "GB" ? value * 1_000_000 : value * 1_000;
}

export function QuotaEditor({ keyId, usageKB, quotaKB }: QuotaEditorProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const initial = quotaKB !== null ? kbToDisplay(quotaKB) : { value: "", unit: "GB" as Unit };
  const [value, setValue] = useState<string>(String(initial.value));
  const [unit, setUnit] = useState<Unit>(initial.unit);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function handleCancel() {
    const reset = quotaKB !== null ? kbToDisplay(quotaKB) : { value: "", unit: "GB" as Unit };
    setValue(String(reset.value));
    setUnit(reset.unit);
    setEditing(false);
  }

  async function handleSave() {
    setSaving(true);
    const newQuotaKB = value === "" ? null : displayToKB(Number(value), unit);
    await fetch(`/api/keys/${keyId}/quota`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quotaKB: newQuotaKB }),
    });
    setSaving(false);
    setEditing(false);
    window.location.reload();
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <Input
          ref={inputRef}
          type="number"
          min="0"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") handleCancel();
          }}
          placeholder="1"
          className="w-20 font-mono text-[0.8125rem]"
          disabled={saving}
        />
        <select
          value={unit}
          onChange={(e) => setUnit(e.target.value as Unit)}
          className="rounded-md border border-border bg-background px-1.5 py-1.5 text-[0.8125rem] focus:outline-none focus:ring-2 focus:ring-ring"
          disabled={saving}
        >
          <option value="MB">MB</option>
          <option value="GB">GB</option>
        </select>
        <IconButton icon={Check} title="Save" onClick={handleSave} disabled={saving} />
        <IconButton icon={X} title="Cancel" onClick={handleCancel} disabled={saving} />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <UsageBar usageKB={usageKB} quotaKB={quotaKB} />
      <IconButton icon={Pencil} title="Edit quota" onClick={() => setEditing(true)} />
    </div>
  );
}
