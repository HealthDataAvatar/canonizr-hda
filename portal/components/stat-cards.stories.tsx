import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { StatCards } from "./stat-cards";

const meta = {
  title: "Components/StatCards",
  component: StatCards,
} satisfies Meta<typeof StatCards>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    processedKB: 4200,
    freeRemainingKB: 45800,
    freeTotalKB: 50000,
    estimatedCost: 0,
  },
};

export const OverFreeTier: Story = {
  name: "Over free tier",
  args: {
    processedKB: 72000,
    freeRemainingKB: 0,
    freeTotalKB: 50000,
    estimatedCost: 0.66,
  },
};

export const Unlimited: Story = {
  name: "Unlimited (internal user)",
  args: {
    processedKB: 150000,
    freeRemainingKB: null,
    freeTotalKB: null,
    estimatedCost: 0,
  },
};

export const Empty: Story = {
  name: "No usage yet",
  args: {
    processedKB: 0,
    freeRemainingKB: 50000,
    freeTotalKB: 50000,
    estimatedCost: 0,
  },
};
