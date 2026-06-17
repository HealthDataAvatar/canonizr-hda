"use client";

import { useState, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { Success, Delete } from "@/components/ui/icons";
import { useKeyActions, type KeyActions } from "@/lib/hooks/use-key-actions";
import { ActionGroup } from "./ui/action-group";
import { IconButton } from "./ui/icon-button";
import { CopyButton } from "./ui/copy-button";

function RotateButton({
  keyId,
  actions,
}: {
  keyId: string;
  actions: KeyActions;
}) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");

  const handleRotate = useCallback(async () => {
    if (!confirm("Regenerate this key? The old key will stop working immediately."))
      return;
    setState("busy");
    const ok = await actions.rotate(keyId);
    if (ok) {
      setState("done");
      setTimeout(() => setState("idle"), 1500);
    } else {
      setState("idle");
    }
  }, [keyId, actions]);

  return (
    <IconButton
      onClick={handleRotate}
      disabled={state === "busy"}
      title={state === "done" ? "Regenerated" : "Regenerate key"}
      icon={state === "done" ? Success : RefreshCw}
    />
  );
}

export function KeyActionsBar({
  keyId,
  keyValue,
  actions: actionsOverride,
}: {
  keyId: string;
  keyValue: string;
  actions?: KeyActions;
}) {
  const defaultActions = useKeyActions();
  const actions = actionsOverride ?? defaultActions;

  async function handleDelete() {
    if (!confirm("Delete this API key? This action is immediate and cannot be undone."))
      return;
    await actions.remove(keyId);
  }

  return (
    <ActionGroup>
      <CopyButton value={keyValue} />
      <RotateButton keyId={keyId} actions={actions} />
      <IconButton
        onClick={handleDelete}
        title="Delete key"
        icon={Delete}
        tone="destructive"
      />
    </ActionGroup>
  );
}

