"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, RefreshCw, Trash2 } from "lucide-react";
import { ActionGroup } from "./ui/action-group";
import { IconButton } from "./ui/icon-button";
import { CopyButton } from "./ui/copy-button";

// TODO: Change these into a hook, simplify this file

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
    <IconButton
      onClick={handleRotate}
      disabled={state === "busy"}
      title={state === "done" ? "Regenerated" : "Regenerate key"}
      aria-label={state === "done" ? "Copied" : "Copy key"}
      icon={state === "done" ? Check : RefreshCw}
    />
  );
}

export function KeyActions({ keyId,
  keyValue,
}: { keyId: string, keyValue: string }) {
  const router = useRouter();

  async function handleDelete() {
    if (!confirm("Delete this API key? This action is immediate and cannot be undone."))
      return;
    await fetch(`/api/keys/${keyId}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <ActionGroup>
      <CopyButton value={keyValue} />
      <RotateButton keyId={keyId} />
      <IconButton
        onClick={handleDelete}
        title="Delete key"
        icon={Trash2}
        tone="destructive"
      />
    </ActionGroup>
  );
}
