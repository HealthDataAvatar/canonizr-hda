"use client";

import { useState } from "react";
import { generateKeyName } from "@/lib/pure/key-names";
import { validateKeyName } from "@/lib/pure/key-name-validation";
import { useKeyActions, type KeyActions } from "@/lib/hooks/use-key-actions";
import { CreateKeyInput } from "@/components/create-key-input";
import { CreatedKeyCard } from "@/components/created-key-card";

type State =
  | { mode: "idle" }
  | { mode: "created"; keyName: string; keyValue: string };

export function CreateKeyForm({
  existingNames,
  actions: actionsOverride,
}: {
  existingNames: string[];
  actions?: KeyActions;
}) {
  const defaultActions = useKeyActions();
  const actions = actionsOverride ?? defaultActions;
  const [state, setState] = useState<State>({ mode: "idle" });
  const [name, setName] = useState(generateKeyName);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);

  const error = validateKeyName(name, existingNames);

  async function handleCreate() {
    setTouched(true);
    if (error) return;
    setLoading(true);
    const result = await actions.create(name);
    setLoading(false);
    if (result) {
      setState({ mode: "created", keyName: result.keyName, keyValue: result.keyValue });
      setName(generateKeyName());
      setTouched(false);
    }
  }

  if (state.mode === "created") {
    return (
      <CreatedKeyCard
        keyName={state.keyName}
        keyValue={state.keyValue}
        onDismiss={() => setState({ mode: "idle" })}
      />
    );
  }

  return (
    <CreateKeyInput
      name={name}
      onNameChange={(v) => {
        setName(v);
        if (!touched) setTouched(true);
      }}
      onRandomise={() => {
        setName(generateKeyName());
        setTouched(false);
      }}
      error={error}
      showError={touched && !!error}
      loading={loading}
      onCreate={handleCreate}
    />
  );
}
