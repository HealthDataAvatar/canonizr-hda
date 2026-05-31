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
  args: { value: "sk_test_abc123" },
};
