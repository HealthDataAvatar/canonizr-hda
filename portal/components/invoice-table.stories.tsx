import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { InvoiceTable } from "./invoice-table";

const meta = {
  title: "Components/InvoiceTable",
  component: InvoiceTable,
} satisfies Meta<typeof InvoiceTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Realistic: Story = {
  name: "Realistic (paid + open)",
  args: {
    invoices: [
      { id: "inv-1", date: "2026-05-01T00:00:00Z", processedKB: 220000, amount: 5.10, status: "open", url: "#" },
      { id: "inv-2", date: "2026-04-01T00:00:00Z", processedKB: 72000, amount: 2.34, status: "paid", url: "#" },
      { id: "inv-3", date: "2026-03-01T00:00:00Z", processedKB: 48200, amount: 0, status: "paid", url: null },
      { id: "inv-4", date: "2026-02-01T00:00:00Z", processedKB: 99000, amount: 1.47, status: "paid", url: "#" },
    ],
  },
};

export const Paginated: Story = {
  name: "Paginated (30 months)",
  args: {
    invoices: Array.from({ length: 30 }, (_, i) => {
      const date = new Date(2026, 4 - i, 1);
      const kb = Math.round(10000 + Math.random() * 200000);
      return {
        id: `inv-${i}`,
        date: date.toISOString(),
        processedKB: kb,
        amount: Math.max(0, ((kb / 100) - 500) * 0.003),
        status: "paid",
        url: "#",
      };
    }),
  },
};

export const Empty: Story = {
  args: { invoices: [] },
};
