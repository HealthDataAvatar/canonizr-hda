"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Check, Copy, RefreshCw, Trash2 } from "lucide-react";

function CopyKeyButton({ keyId }: { keyId: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");

  const handleCopy = useCallback(async () => {
    setState("busy");
    const res = await fetch(`/api/keys/${keyId}`);
    const data = await res.json();
    if (res.ok) {
      await navigator.clipboard.writeText(data.primaryKey);
      setState("done");
      setTimeout(() => setState("idle"), 1500);
    } else {
      setState("idle");
    }
  }, [keyId]);

  return (
    <Button
      variant="outline"
      size="icon-sm"
      onClick={handleCopy}
      disabled={state === "busy"}
      title={state === "done" ? "Copied" : "Copy key"}
      aria-label={state === "done" ? "Copied" : "Copy key"}
    >
      {state === "done" ? (
        <Check className="size-3.5 text-accent" />
      ) : (
        <Copy className="size-3.5" />
      )}
    </Button>
  );
}

function RotateButton({ keyId }: { keyId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");

  const handleRotate = useCallback(async () => {
    if (!confirm("Regenerate this key? The old key will stop working immediately."))
      return;
    setState("busy");
    const res = await fetch(`/api/keys/${keyId}/rotate`, { method: "POST" });
    if (res.ok) {
      setState("done");
      router.refresh();
      setTimeout(() => setState("idle"), 1500);
    } else {
      setState("idle");
    }
  }, [keyId, router]);

  return (
    <Button
      variant="outline"
      size="icon-sm"
      onClick={handleRotate}
      disabled={state === "busy"}
      title={state === "done" ? "Regenerated" : "Regenerate key"}
      aria-label={state === "done" ? "Regenerated" : "Regenerate key"}
    >
      {state === "done" ? (
        <Check className="size-3.5 text-accent" />
      ) : (
        <RefreshCw className="size-3.5" />
      )}
    </Button>
  );
}

export function KeyActions({ keyId }: { keyId: string }) {
  const router = useRouter();

  async function handleDelete() {
    if (!confirm("Delete this API key? This action is immediate and cannot be undone."))
      return;
    await fetch(`/api/keys/${keyId}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="flex justify-end gap-2">
      <CopyKeyButton keyId={keyId} />
      <RotateButton keyId={keyId} />
      <Button variant="ghost" size="icon-sm" onClick={handleDelete} title="Delete key" aria-label="Delete key" className="text-muted-foreground hover:text-destructive">
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}
