import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Showcase } from "@/.storybook/common";
import { Input } from "./input";
import { Label } from "./label";

const meta = {
  title: "UI/Input",
  component: Input,
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;


export const AllStates: Story = {
  render: () => (
    <Showcase
      maxWidth="max-w-sm"
      items={[
        { label: "Empty", children: <Input placeholder="e.g. production, agent-1" /> },
        { label: "Filled", children: <Input defaultValue="agent-bold-crane" /> },
        { label: "Email", children: <Input defaultValue="agent-bold-crane" type="email" /> },
        { label: "Long value (overflow)", children: <Input defaultValue={"a]very-long-key-name-that-should-overflow-or-truncate-in-the-input-field-to-test-boundaries"} /> },
        { label: "Disabled", children: <Input defaultValue="locked-value" disabled /> },
        { label: "With maxLength (64)", children: <Input defaultValue={"a".repeat(64)} maxLength={64} /> },
      ]}
    />
  ),
};
