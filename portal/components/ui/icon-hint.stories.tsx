import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Check, Circle, TimerOff, Loader, Download } from "lucide-react";
import { IconHint } from "./icon-hint";

const meta = {
  title: "UI/IconHint",
  component: IconHint,
} satisfies Meta<typeof IconHint>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllTones: Story = {
  args: { icon: Check, title: "All tones" },
  render: () => (
    <div className="flex items-center gap-6">
      <IconHint icon={Check} title="Muted (default)" tone="muted" />
      <IconHint icon={Download} title="Foreground" tone="foreground" />
      <IconHint icon={Loader} title="Accent" tone="accent" />
      <IconHint icon={TimerOff} title="Destructive" tone="destructive" />
    </div>
  ),
};
