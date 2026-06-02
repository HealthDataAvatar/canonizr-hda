import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Showcase } from "@/.storybook/common";
import { BillingPageContent } from "./billing-page-content";

const invoices = [
  { id: "inv-1", date: "2026-05-01T00:00:00Z", processedKB: 220000, amount: 5.10, status: "open", url: "#" },
  { id: "inv-2", date: "2026-04-01T00:00:00Z", processedKB: 72000, amount: 2.34, status: "paid", url: "#" },
  { id: "inv-3", date: "2026-03-01T00:00:00Z", processedKB: 48200, amount: 0, status: "paid", url: null },
];

const meta = {
  title: "Pages/Billing",
  component: BillingPageContent,
} satisfies Meta<typeof BillingPageContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllStates: Story = {
  args: { processedKB: 0, freeRemainingKB: 50000, freeTotalKB: 50000, estimatedCost: 0, pricePerUnit: 0.003, invoices: [] },
  render: () => (
    <Showcase
      items={[
        {
          label: "New user (no usage, no invoices)",
          children: <BillingPageContent processedKB={0} freeRemainingKB={50000} freeTotalKB={50000} estimatedCost={0} pricePerUnit={0.003} invoices={[]} />,
        },
        {
          label: "Active user (within free tier)",
          children: <BillingPageContent processedKB={4200} freeRemainingKB={45800} freeTotalKB={50000} estimatedCost={0} pricePerUnit={0.003} invoices={invoices.slice(1)} />,
        },
        {
          label: "Heavy user (over free tier)",
          children: <BillingPageContent processedKB={220000} freeRemainingKB={0} freeTotalKB={50000} estimatedCost={5.10} pricePerUnit={0.003} invoices={invoices} />,
        },
        {
          label: "Unlimited (internal user)",
          children: <BillingPageContent processedKB={150000} freeRemainingKB={null} freeTotalKB={null} estimatedCost={0} pricePerUnit={0.003} invoices={[]} />,
        },
      ]}
    />
  ),
};
