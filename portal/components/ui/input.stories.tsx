import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Input } from "./input";
import { Label } from "./label";

const meta = {
  title: "UI/Input",
  component: Input,
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { placeholder: "e.g. production, agent-1" },
};

export const Email: Story = {
  args: { type: "email", placeholder: "you@example.com" },
};

export const WithLabel: Story = {
  render: () => (
    <div className="max-w-sm space-y-1.5">
      <Label htmlFor="key-name">Key name</Label>
      <Input id="key-name" placeholder="e.g. production, agent-1" maxLength={64} />
    </div>
  ),
};
