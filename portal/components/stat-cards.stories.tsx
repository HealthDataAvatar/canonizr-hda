import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { StatCards } from "./stat-cards";

const meta = {
  title: "Components/StatCards",
  component: StatCards,
} satisfies Meta<typeof StatCards>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllStates: Story = {
  args: { processedKB: 0, freeRemainingKB: 50000, freeTotalKB: 50000, estimatedCost: 0 },
  render: () => (
    <div className="space-y-8">
      <div>
        <p className="text-xs text-muted-foreground mb-2">No usage yet</p>
        <StatCards processedKB={0} freeRemainingKB={50000} freeTotalKB={50000} estimatedCost={0} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-2">Within free tier</p>
        <StatCards processedKB={4200} freeRemainingKB={45800} freeTotalKB={50000} estimatedCost={0} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-2">Over free tier</p>
        <StatCards processedKB={72000} freeRemainingKB={0} freeTotalKB={50000} estimatedCost={0.66} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-2">Unlimited (internal user)</p>
        <StatCards processedKB={150000} freeRemainingKB={null} freeTotalKB={null} estimatedCost={0} />
      </div>
    </div>
  ),
};
