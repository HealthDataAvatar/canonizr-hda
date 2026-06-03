import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Showcase, TEST_KEY_NAMES, TEST_KEY_VALUES } from "@/.storybook/common";
import { Playground, KeySelector } from "./playground";
import type { KeyOption } from "./playground";
import { Skeleton } from "@/components/ui/skeleton";

const sampleKeys: KeyOption[] = [
  { id: "1", displayName: TEST_KEY_NAMES.crane, key: TEST_KEY_VALUES.key1, usageKB: 3200, quotaKB: 10000 },
  { id: "2", displayName: TEST_KEY_NAMES.raven, key: TEST_KEY_VALUES.key2, usageKB: 800, quotaKB: 10000 },
  { id: "3", displayName: TEST_KEY_NAMES.otter, key: TEST_KEY_VALUES.key3, usageKB: 0, quotaKB: null },
];

const keysSlot = <KeySelector keys={sampleKeys} />;

const sampleMarkdown = `# Invoice #2024-0042

**Date:** 2024-03-15
**Due:** 2024-04-14

| Item | Qty | Unit Price | Total |
|------|-----|-----------|-------|
| Widget A | 100 | $12.50 | $1,250.00 |
| Widget B | 50 | $8.75 | $437.50 |

**Total: $1,687.50**

Payment terms: Net 30. Please remit to account ending in 4821.`;

const meta = {
  title: "Pages/Playground",
  component: Playground,
} satisfies Meta<typeof Playground>;

export default meta;
type Story = StoryObj<typeof meta>;

function KeySelectorSkeleton() {
  return (
    <div className="space-y-1.5">
      <Skeleton className="h-4 w-14" />
      <Skeleton className="h-10 w-48" />
    </div>
  );
}

export const AllStates: Story = {
  args: { keySelectorSlot: keysSlot },
  render: () => (
    <Showcase
      items={[
        { label: "Idle", children: <Playground keySelectorSlot={keysSlot} /> },
        {
          label: "Single key (no quota)",
          children: (
            <Playground
              keySelectorSlot={
                <KeySelector
                  keys={[{ id: "1", displayName: TEST_KEY_NAMES.crane, key: TEST_KEY_VALUES.key1, usageKB: 0, quotaKB: null }]}
                />
              }
            />
          ),
        },
        { label: "Loading keys", children: <Playground keySelectorSlot={<KeySelectorSkeleton />} /> },
        {
          label: "Processing",
          children: (
            <Playground
              keySelectorSlot={keysSlot}
              initialResult={{ status: "processing" }}
            />
          ),
        },
        {
          label: "Result",
          children: (
            <Playground
              keySelectorSlot={keysSlot}
              initialResult={{
                status: "done",
                markdown: sampleMarkdown,
                jobInfo: { inputBytes: 245_760, timeMs: 3_420 },
              }}
            />
          ),
        },
        {
          label: "Error",
          children: (
            <Playground
              keySelectorSlot={keysSlot}
              initialResult={{
                status: "error",
                error: "Processing failed: document is password-protected",
              }}
            />
          ),
        },
      ]}
    />
  ),
};
