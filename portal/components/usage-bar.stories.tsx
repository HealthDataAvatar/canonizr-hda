import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Showcase } from "@/.storybook/common";
import { UsageBar } from "./usage-bar";

const meta = {
  title: "Components/UsageBar",
  component: UsageBar,
} satisfies Meta<typeof UsageBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllStates: Story = {
  args: { usageKB: 0, quotaKB: 10000 },
  render: () => (
    <Showcase
      maxWidth="max-w-md"
      gap="space-y-6"
      items={[
        { label: "Empty", children: <UsageBar usageKB={0} quotaKB={10000} /> },
        { label: "Normal (32%)", children: <UsageBar usageKB={3200} quotaKB={10000} /> },
        { label: "Near full (95%)", children: <UsageBar usageKB={9500} quotaKB={10000} /> },
        { label: "Full (100%)", children: <UsageBar usageKB={10000} quotaKB={10000} /> },
        { label: "No quota (unlimited)", children: <UsageBar usageKB={5000} quotaKB={null} /> },
      ]}
    />
  ),
};
