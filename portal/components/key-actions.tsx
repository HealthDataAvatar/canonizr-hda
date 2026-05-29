"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Eye, RefreshCw, Trash2 } from "lucide-react";

export function KeyActions({ keyId }: { keyId: string }) {
  const router = useRouter();
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [revealLabel, setRevealLabel] = useState<string | null>(null);

  async function handleReveal() {
    const res = await fetch(`/api/keys/${keyId}`);
    const data = await res.json();
    if (res.ok) {
      setRevealedKey(data.primaryKey);
      setRevealLabel("Your key");
    }
  }

  async function handleRotate() {
    if (!confirm("Rotate this key? The old key will stop working immediately."))
      return;
    const res = await fetch(`/api/keys/${keyId}/rotate`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setRevealedKey(data.primaryKey);
      setRevealLabel("New key — the old key has stopped working");
      router.refresh();
    }
  }

  async function handleDelete() {
    if (
      !confirm(
        "Delete this API key? This action is immediate and cannot be undone."
      )
    )
      return;
    await fetch(`/api/keys/${keyId}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="icon-sm" onClick={handleReveal} title="Show key" aria-label="Show key">
          <Eye className="size-3.5" />
        </Button>
        <Button variant="outline" size="icon-sm" onClick={handleRotate} title="Rotate key" aria-label="Rotate key">
          <RefreshCw className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={handleDelete} title="Delete key" aria-label="Delete key" className="text-muted-foreground hover:text-destructive">
          <Trash2 className="size-3.5" />
        </Button>
      </div>
      {revealedKey && (
        <div className="space-y-2 rounded-md border border-border p-3">
          <p className="text-[0.8125rem] text-muted-foreground">
            {revealLabel}
          </p>
          <div className="flex items-center gap-2 rounded-md bg-surface px-3 py-2">
            <code className="flex-1 break-all font-mono text-[0.8125rem]">
              {revealedKey}
            </code>
            <CopyButton value={revealedKey} size="sm" />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRevealedKey(null)}
          >
            Dismiss
          </Button>
        </div>
      )}
    </div>
  );
}
