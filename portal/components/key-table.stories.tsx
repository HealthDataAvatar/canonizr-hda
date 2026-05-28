import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { KeyTable } from "./key-table";

const meta = {
  title: "Components/KeyTable",
  component: KeyTable,
} satisfies Meta<typeof KeyTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithKeys: Story = {
  args: {
    keys: [
      { id: "1", displayName: "agent-bold-crane", createdDate: "20 May 2026", lastUsed: "2 hours ago", usageKB: 3200, quotaKB: 10000 },
      { id: "2", displayName: "agent-quiet-raven", createdDate: "25 May 2026", lastUsed: "5 min ago", usageKB: 800, quotaKB: 10000 },
      { id: "3", displayName: "agent-swift-otter", createdDate: "28 May 2026", lastUsed: "Never", usageKB: 0, quotaKB: null },
    ],
  },
};

export const NearQuota: Story = {
  args: {
    keys: [
      { id: "1", displayName: "agent-bold-crane", createdDate: "20 May 2026", lastUsed: "1 min ago", usageKB: 9500, quotaKB: 10000 },
      { id: "2", displayName: "agent-quiet-raven", createdDate: "25 May 2026", lastUsed: "3 hours ago", usageKB: 10000, quotaKB: 10000 },
    ],
  },
};

export const SingleKey: Story = {
  args: {
    keys: [
      { id: "1", displayName: "agent-bold-crane", createdDate: "20 May 2026", lastUsed: "Never", usageKB: 0, quotaKB: null },
    ],
  },
};

export const Empty: Story = {
  args: { keys: [] },
};
