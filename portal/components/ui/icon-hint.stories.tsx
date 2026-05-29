import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Check, Circle, TimerOff, Loader, Download } from "lucide-react";
import { IconHint } from "./icon-hint";

const meta = {
  title: "UI/IconHint",
  component: IconHint,
} satisfies Meta<typeof IconHint>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { icon: Check, title: "Paid" },
};

export const Faded: Story = {
  args: { icon: TimerOff, title: "Expired", tone: "faded" },
};

export const AllTones: Story = {
  args: { icon: Check, title: "All tones" },
  render: () => (
    <div className="flex items-center gap-6">
      <IconHint icon={Check} title="Muted (default)" tone="muted" />
      <IconHint icon={Circle} title="Faded" tone="faded" />
      <IconHint icon={Download} title="Foreground" tone="foreground" />
      <IconHint icon={Loader} title="Accent" tone="accent" />
      <IconHint icon={TimerOff} title="Destructive" tone="destructive" />
    </div>
  ),
};

export const Sizes: Story = {
  args: { icon: Check, title: "Sizes" },
  render: () => (
    <div className="flex items-center gap-6">
      <IconHint icon={Check} title="Small" size="sm" />
      <IconHint icon={Check} title="Default" size="default" />
      <IconHint icon={Check} title="Large" size="lg" />
    </div>
  ),
};
