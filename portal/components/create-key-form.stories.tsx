import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CreateKeyInput } from "./create-key-input";
import { CreatedKeyCard } from "./created-key-card";
import { validateKeyName } from "@/lib/key-name-validation";
import { generateKeyName } from "@/lib/key-names";

// ---------------------------------------------------------------------------
// CreateKeyInput stories
// ---------------------------------------------------------------------------

function InputInteractive({
  existingNames,
  initialName,
}: {
  existingNames: string[];
  initialName?: string;
}) {
  const [name, setName] = useState(initialName ?? generateKeyName);
  const [touched, setTouched] = useState(!!initialName);
  const error = validateKeyName(name, existingNames);

  return (
    <CreateKeyInput
      name={name}
      onNameChange={(v) => {
        setName(v);
        if (!touched) setTouched(true);
      }}
      error={error}
      showError={touched && !!error}
      loading={false}
      onCreate={() => setTouched(true)}
    />
  );
}

const inputMeta = {
  title: "Components/CreateKeyInput",
  component: InputInteractive,
} satisfies Meta<typeof InputInteractive>;

export default inputMeta;
type InputStory = StoryObj<typeof inputMeta>;

export const Default: InputStory = {
  args: { existingNames: [] },
};

export const DuplicateName: InputStory = {
  args: {
    existingNames: ["agent-bold-crane", "agent-quiet-raven"],
    initialName: "agent-bold-crane",
  },
};

export const Loading: InputStory = {
  args: { existingNames: [] },
  render: () => (
    <CreateKeyInput
      name="agent-bold-crane"
      onNameChange={() => {}}
      error={null}
      showError={false}
      loading={true}
      onCreate={() => {}}
    />
  ),
};

// ---------------------------------------------------------------------------
// CreatedKeyCard stories
// ---------------------------------------------------------------------------

export const KeyCreated: InputStory = {
  args: { existingNames: [] },
  render: () => (
    <CreatedKeyCard
      keyName="agent-bold-crane"
      keyValue="abc123def456ghi789jkl012mno345pq"
      onDismiss={() => {}}
    />
  ),
};
