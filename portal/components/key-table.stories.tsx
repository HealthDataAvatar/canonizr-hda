import type { Meta, StoryObj } from "@storybook/nextjs-vite";
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
    <div className="space-y-10">
      <div>
        <p className="text-xs text-muted-foreground mb-2">Multiple keys with quotas</p>
        <KeyTable keys={[
          { id: "1", displayName: "agent-bold-crane", value: "a3f2",  usageKB: 3200, quotaKB: 10000 },
          { id: "2", displayName: "agent-quiet-raven", value: "9c1e", usageKB: 800, quotaKB: 10000 },
          { id: "3", displayName: "agent-swift-otter", value: "7b4d",  usageKB: 0, quotaKB: null },
        ]} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-2">Near / at quota</p>
        <KeyTable keys={[
          { id: "1", displayName: "agent-bold-crane", value: "a3f2", usageKB: 9500, quotaKB: 10000 },
          { id: "2", displayName: "agent-quiet-raven", value: "9c1e", usageKB: 10000, quotaKB: 10000 },
        ]} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-2">New user (single key, no limit)</p>
        <KeyTable keys={[
          { id: "1", displayName: "my-first-key", value: "a3f2",  usageKB: 0, quotaKB: null },
        ]} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-2">Empty</p>
        <KeyTable keys={[]} />
      </div>
    </div>
  ),
};
