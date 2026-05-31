import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CreateKeyInput } from "./create-key-input";
import { CreatedKeyCard } from "./created-key-card";
import { validateKeyName } from "@/lib/pure/key-name-validation";
import { generateKeyName } from "@/lib/pure/key-names";

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

const noop = () => {};

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
    <div className="space-y-8 max-w-2xl">
      <div>
        <p className="text-xs text-muted-foreground mb-2">Default</p>
        <CreateKeyInput
          name="agent-bold-crane"
          onNameChange={noop}
          onRandomise={noop}
          error={null}
          showError={false}
          loading={false}
          onCreate={noop}
        />
      </div>

      <div>
        <p className="text-xs text-muted-foreground mb-2">Duplicate name</p>
        <CreateKeyInput
          name="agent-bold-crane"
          onNameChange={noop}
          onRandomise={noop}
          error="A key with this name already exists."
          showError={true}
          loading={false}
          onCreate={noop}
        />
      </div>

      <div>
        <p className="text-xs text-muted-foreground mb-2">Loading</p>
        <CreateKeyInput
          name="agent-bold-crane"
          onNameChange={noop}
          onRandomise={noop}
          error={null}
          showError={false}
          loading={true}
          onCreate={noop}
        />
      </div>

      <div>
        <p className="text-xs text-muted-foreground mb-2">Key created</p>
        <CreatedKeyCard
          keyName="agent-bold-crane"
          keyValue="abc123def456ghi789jkl012mno345pq"
          onDismiss={noop}
        />
      </div>
    </div>
  ),
};
