import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button } from "./button";

const meta = {
  title: "UI/Button",
  component: Button,
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "destructive", "outline", "secondary", "ghost"],
    },
    size: {
      control: "select",
      options: ["default", "sm", "lg", "icon"],
    },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: { children: "Create key", variant: "default" },
};

export const Outline: Story = {
  args: { children: "Continue with GitHub", variant: "outline" },
};

export const Destructive: Story = {
  args: { children: "Delete", variant: "destructive", size: "sm" },
};

export const Ghost: Story = {
  args: { children: "Dashboard", variant: "ghost", size: "sm" },
};

export const Small: Story = {
  args: { children: "Rotate", variant: "outline", size: "sm" },
};

export const Disabled: Story = {
  args: { children: "Create key", variant: "default", disabled: true },
};

export const DisabledOutline: Story = {
  args: { children: "Continue with GitHub", variant: "outline", disabled: true },
};

export const AllVariants: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="default">Primary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">Destructive</Button>
        </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="default" disabled>Primary</Button>
        <Button variant="outline" disabled>Outline</Button>
        <Button variant="secondary" disabled>Secondary</Button>
        <Button variant="ghost" disabled>Ghost</Button>
        <Button variant="destructive" disabled>Destructive</Button>
      </div>
    </div>
  ),
};
