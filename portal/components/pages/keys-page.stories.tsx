import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Showcase, TEST_KEY_NAMES, TEST_KEY_VALUES } from "@/.storybook/common";
import { KeysPageContent, KeysDataSlots, KeysLoadingSlots } from "./keys-page-content";
import type { KeyRow } from "@/components/tables/key-table";

const sampleKeys: KeyRow[] = [
  { id: "1", displayName: TEST_KEY_NAMES.crane, value: TEST_KEY_VALUES.key1, usageKB: 3200, quotaKB: 10000 },
  { id: "2", displayName: TEST_KEY_NAMES.raven, value: TEST_KEY_VALUES.key2, usageKB: 800, quotaKB: 10000 },
  { id: "3", displayName: TEST_KEY_NAMES.otter, value: TEST_KEY_VALUES.key3, usageKB: 0, quotaKB: null },
];

const meta = {
  title: "Pages/Keys",
  component: KeysPageContent,
} satisfies Meta<typeof KeysPageContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllStates: Story = {
  args: { dataSlot: <KeysDataSlots keys={sampleKeys} /> },
  render: () => (
    <Showcase
      items={[
        { label: "With keys", children: <KeysPageContent dataSlot={<KeysDataSlots keys={sampleKeys} />} /> },
        {
          label: "New user (single key)",
          children: (
            <KeysPageContent
              dataSlot={
                <KeysDataSlots
                  keys={[{ id: "1", displayName: "my-first-key", value: TEST_KEY_VALUES.key1, usageKB: 0, quotaKB: null }]}
                />
              }
            />
          ),
        },
        { label: "Empty (no keys)", children: <KeysPageContent dataSlot={<KeysDataSlots keys={[]} />} /> },
        { label: "Loading", children: <KeysPageContent dataSlot={<KeysLoadingSlots />} /> },
      ]}
    />
  ),
};
