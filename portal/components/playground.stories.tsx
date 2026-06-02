import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Showcase, TEST_KEY_NAMES, TEST_KEY_VALUES } from "@/.storybook/common";
import { Playground } from "./playground";
import { PlaygroundSkeleton } from "./playground-skeleton";
import type { KeyOption } from "./playground";

const sampleKeys: KeyOption[] = [
  { id: "1", displayName: TEST_KEY_NAMES.crane, key: TEST_KEY_VALUES.key1, usageKB: 3200, quotaKB: 10000 },
  { id: "2", displayName: TEST_KEY_NAMES.raven, key: TEST_KEY_VALUES.key2, usageKB: 800, quotaKB: 10000 },
  { id: "3", displayName: TEST_KEY_NAMES.otter, key: TEST_KEY_VALUES.key3, usageKB: 0, quotaKB: null },
];

const meta = {
  title: "Pages/Playground",
  component: Playground,
} satisfies Meta<typeof Playground>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllStates: Story = {
  args: { keys: sampleKeys },
  render: () => (
    <Showcase
      items={[
        { label: "With keys", children: <Playground keys={sampleKeys} /> },
        {
          label: "Single key (no quota)",
          children: (
            <Playground
              keys={[{ id: "1", displayName: TEST_KEY_NAMES.crane, key: TEST_KEY_VALUES.key1, usageKB: 0, quotaKB: null }]}
            />
          ),
        },
        { label: "Loading", children: <PlaygroundSkeleton /> },
      ]}
    />
  ),
};
