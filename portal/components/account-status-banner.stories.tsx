import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Showcase } from "@/.storybook/common";
import { AccountStatusBanner } from "@/components/account-status-banner";

const meta = {
  title: "Components/AccountStatusBanner",
  component: AccountStatusBanner,
} satisfies Meta<typeof AccountStatusBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllStates: Story = {
  args: { blocked: false, delinquent: false },
  render: () => (
    <Showcase
      gap="space-y-4"
      items={[
        { label: "Payment overdue", children: <AccountStatusBanner blocked={false} delinquent={true} /> },
        { label: "Blocked (admin/abuse)", children: <AccountStatusBanner blocked={true} delinquent={false} /> },
        { label: "Both set — blocked wins", children: <AccountStatusBanner blocked={true} delinquent={true} /> },
        { label: "Clean account — renders nothing", children: <AccountStatusBanner blocked={false} delinquent={false} /> },
      ]}
    />
  ),
};
