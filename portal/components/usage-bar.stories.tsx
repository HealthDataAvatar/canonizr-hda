import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { UsageBar } from "./usage-bar";

const meta = {
  title: "Components/UsageBar",
  component: UsageBar,
} satisfies Meta<typeof UsageBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Normal: Story = {
  args: { usageKB: 3200, quotaKB: 10000 },
};

export const NearFull: Story = {
  args: { usageKB: 9500, quotaKB: 10000 },
};

export const Full: Story = {
  args: { usageKB: 10000, quotaKB: 10000 },
};

export const NoQuota: Story = {
  args: { usageKB: 5000, quotaKB: null },
};

export const Empty: Story = {
  args: { usageKB: 0, quotaKB: 10000 },
};
