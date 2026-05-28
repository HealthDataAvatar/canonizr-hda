"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";

export function KeyActions({ keyId }: { keyId: string }) {
  const router = useRouter();
  const [rotatedKey, setRotatedKey] = useState<string | null>(null);

  async function handleRotate() {
    if (!confirm("Rotate this key? The old key will stop working immediately."))
      return;
    const res = await fetch(`/api/keys/${keyId}/rotate`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setRotatedKey(data.primaryKey);
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
        <Button variant="outline" size="sm" onClick={handleRotate}>
          Rotate
        </Button>
        <Button variant="destructive" size="sm" onClick={handleDelete}>
          Delete
        </Button>
      </div>
      {rotatedKey && (
        <div className="space-y-2 rounded-md border border-border p-3">
          <p className="text-[0.8125rem] text-muted-foreground">
            New key — copy now, it won&apos;t be shown again.
          </p>
          <div className="flex items-center gap-2 rounded-md bg-surface px-3 py-2">
            <code className="flex-1 break-all font-mono text-[0.8125rem]">
              {rotatedKey}
            </code>
            <CopyButton value={rotatedKey} size="sm" />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRotatedKey(null)}
          >
            Dismiss
          </Button>
        </div>
      )}
    </div>
  );
}
