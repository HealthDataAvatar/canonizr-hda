import type { Meta, StoryObj } from "@storybook/nextjs-vite";
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
    <div className="space-y-6 max-w-md">
      <div>
        <p className="text-xs text-muted-foreground mb-1">Empty</p>
        <UsageBar usageKB={0} quotaKB={10000} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-1">Normal (32%)</p>
        <UsageBar usageKB={3200} quotaKB={10000} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-1">Near full (95%)</p>
        <UsageBar usageKB={9500} quotaKB={10000} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-1">Full (100%)</p>
        <UsageBar usageKB={10000} quotaKB={10000} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-1">No quota (unlimited)</p>
        <UsageBar usageKB={5000} quotaKB={null} />
      </div>
    </div>
  ),
};
