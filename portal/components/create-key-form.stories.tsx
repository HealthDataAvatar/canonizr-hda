import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Showcase } from "@/.storybook/common";
import { CreateKeyInput } from "./create-key-input";
import { CreatedKeyCard } from "./created-key-card";
import { validateKeyName } from "@/lib/pure/key-name-validation";
import { generateKeyName } from "@/lib/pure/key-names";

const noop = () => {};

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
      onRandomise={() => {
        setName(generateKeyName());
        setTouched(false);
      }}
      error={error}
      showError={touched && !!error}
      loading={false}
      onCreate={() => setTouched(true)}
    />
  );
}

const meta = {
  title: "Components/CreateKeyInput",
  component: InputInteractive,
} satisfies Meta<typeof InputInteractive>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Interactive: Story = {
  args: { existingNames: [] },
};

export const AllStates: Story = {
  args: { existingNames: [] },
  render: () => (
    <Showcase
      maxWidth="max-w-2xl"
      items={[
        { label: "Default", children: <CreateKeyInput name="agent-bold-crane" onNameChange={noop} onRandomise={noop} error={null} showError={false} loading={false} onCreate={noop} /> },
        { label: "Duplicate name", children: <CreateKeyInput name="agent-bold-crane" onNameChange={noop} onRandomise={noop} error="A key with this name already exists." showError={true} loading={false} onCreate={noop} /> },
        { label: "Loading", children: <CreateKeyInput name="agent-bold-crane" onNameChange={noop} onRandomise={noop} error={null} showError={false} loading={true} onCreate={noop} /> },
        { label: "Key created", children: <CreatedKeyCard keyName="agent-bold-crane" keyValue="abc123def456ghi789jkl012mno345pq" onDismiss={noop} /> },
      ]}
    />
  ),
};
