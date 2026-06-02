import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Showcase } from "@/.storybook/common";
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
    <Showcase items={[
      { label: "No usage yet", children: <StatCards processedKB={0} freeRemainingKB={50000} freeTotalKB={50000} estimatedCost={0} /> },
      { label: "Within free tier", children: <StatCards processedKB={4200} freeRemainingKB={45800} freeTotalKB={50000} estimatedCost={0} /> },
      { label: "Over free tier", children: <StatCards processedKB={72000} freeRemainingKB={0} freeTotalKB={50000} estimatedCost={0.66} /> },
      { label: "Unlimited (internal user)", children: <StatCards processedKB={150000} freeRemainingKB={null} freeTotalKB={null} estimatedCost={0} /> },
    ]} />
  ),
};
