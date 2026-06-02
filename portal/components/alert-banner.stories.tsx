import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Showcase } from "@/.storybook/common";
import { AlertBanner } from "./alert-banner";
import { Button } from "@/components/ui/button";

const meta = {
  title: "UI/AlertBanner",
  component: AlertBanner,
} satisfies Meta<typeof AlertBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllStates: Story = {
  args: { variant: "error", message: "Something went wrong." },
  render: () => (
    <Showcase
      items={[
        {
          label: "Error",
          children: <AlertBanner variant="error" message="Payment failed. Update your payment method to restore API access." />,
        },
        {
          label: "Error with action",
          children: <AlertBanner variant="error" message="Free tier exhausted. Add a payment method to continue using the API." action={<Button variant="outline" size="sm">Manage billing</Button>} />,
        },
        {
          label: "Warning",
          children: <AlertBanner variant="warning" message="You've used 85% of your free tier. Add a payment method to avoid interruption." />,
        },
        {
          label: "Warning with action",
          children: <AlertBanner variant="warning" message="Your API key expires in 7 days." action={<Button variant="outline" size="sm">Renew</Button>} />,
        },
      ]}
    />
  ),
};
