import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Badge } from "./badge";

const meta = {
  title: "UI/Badge",
  component: Badge,
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "secondary", "destructive", "outline"],
    },
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Active: Story = {
  args: { children: "active", variant: "default" },
};

export const Suspended: Story = {
  args: { children: "suspended", variant: "secondary" },
};

export const ErrorStatus: Story = {
  args: { children: "400", variant: "destructive" },
};

export const SuccessStatus: Story = {
  args: { children: "200", variant: "default" },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Badge variant="default">active</Badge>
      <Badge variant="secondary">suspended</Badge>
      <Badge variant="destructive">400</Badge>
      <Badge variant="outline">outline</Badge>
    </div>
  ),
};
