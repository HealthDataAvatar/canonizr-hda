"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { generateKeyName } from "@/lib/pure/key-names";
import { validateKeyName } from "@/lib/pure/key-name-validation";
import { CreateKeyInput } from "@/components/create-key-input";
import { CreatedKeyCard } from "@/components/created-key-card";

type State =
  | { mode: "idle" }
  | { mode: "created"; keyName: string; keyValue: string };

export function CreateKeyForm({
  existingNames,
}: {
  existingNames: string[];
}) {
  const router = useRouter();
  const [state, setState] = useState<State>({ mode: "idle" });
  const [name, setName] = useState(generateKeyName);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);

  const error = validateKeyName(name, existingNames);

  async function handleCreate() {
    setTouched(true);
    if (error) return;
    setLoading(true);
    const res = await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) {
      setState({ mode: "created", keyName: name.trim(), keyValue: data.primaryKey });
      setName(generateKeyName());
      setTouched(false);
      router.refresh();
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
