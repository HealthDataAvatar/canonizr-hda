import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Showcase, TEST_KEY_NAMES, TEST_KEY_VALUES } from "@/.storybook/common";
import { KeyTable } from "./key-table";

const meta = {
  title: "Components/KeyTable",
  component: KeyTable,
} satisfies Meta<typeof KeyTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllStates: Story = {
  args: { keys: [] },
  render: () => (
    <Showcase
      gap="space-y-10"
      items={[
        {
          label: "Multiple keys with quotas",
          children: (
            <KeyTable keys={[
              { id: "1", displayName: TEST_KEY_NAMES.crane, value: TEST_KEY_VALUES.key1, usageKB: 3200, quotaKB: 10000 },
              { id: "2", displayName: TEST_KEY_NAMES.raven, value: TEST_KEY_VALUES.key2, usageKB: 800, quotaKB: 10000 },
              { id: "3", displayName: TEST_KEY_NAMES.otter, value: TEST_KEY_VALUES.key3, usageKB: 0, quotaKB: null },
            ]} />
          ),
        },
        {
          label: "Near / at quota",
          children: (
            <KeyTable keys={[
              { id: "1", displayName: TEST_KEY_NAMES.crane, value: TEST_KEY_VALUES.key1, usageKB: 9500, quotaKB: 10000 },
              { id: "2", displayName: TEST_KEY_NAMES.raven, value: TEST_KEY_VALUES.key2, usageKB: 10000, quotaKB: 10000 },
            ]} />
          ),
        },
        {
          label: "New user (single key, no limit)",
          children: (
            <KeyTable keys={[
              { id: "1", displayName: "my-first-key", value: TEST_KEY_VALUES.key1, usageKB: 0, quotaKB: null },
            ]} />
          ),
        },
        { label: "Empty", children: <KeyTable keys={[]} /> },
      ]}
    />
  ),
};
