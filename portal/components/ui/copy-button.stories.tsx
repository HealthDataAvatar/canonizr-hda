import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CopyButton } from "./copy-button";

const meta = {
  title: "UI/CopyButton",
  component: CopyButton,
} satisfies Meta<typeof CopyButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { value: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4" },
};

export const Small: Story = {
  args: { value: "sk_test_abc123", size: "sm" },
};

export const InContext: Story = {
  args: { value: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4" },
  render: () => (
    <div className="flex items-center gap-2 rounded-md bg-surface px-4 py-3">
      <code className="font-mono text-sm flex-1 break-all">
        a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4
      </code>
      <CopyButton value="a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4" />
    </div>
  ),
};
