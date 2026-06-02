import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Showcase } from "../.storybook/common";
import { ErrorBanner } from "./error-banner";

const meta = {
  title: "Components/ErrorBanner",
  component: ErrorBanner,
} satisfies Meta<typeof ErrorBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllStates: Story = {
  args: {
    error: { id: "req-j0k1l2", keyName: "agent-bold-crane", status: 400, timestamp: new Date(Date.now() - 2 * 60 * 1000).toISOString() },
  },
  render: () => (
    <Showcase
      gap="space-y-4"
      items={[
        { label: "Bad request (400)", children: <ErrorBanner error={{ id: "req-j0k1l2", keyName: "agent-bold-crane", status: 400, timestamp: new Date(Date.now() - 2 * 60 * 1000).toISOString() }} /> },
        { label: "Rate limited (429)", children: <ErrorBanner error={{ id: "req-p6q7r8", keyName: "agent-swift-otter", status: 429, timestamp: new Date(Date.now() - 10 * 1000).toISOString() }} /> },
        { label: "Server error (500)", children: <ErrorBanner error={{ id: "req-m3n4o5", keyName: "agent-quiet-raven", status: 500, timestamp: new Date(Date.now() - 30 * 1000).toISOString() }} /> },
      ]}
    />
  ),
};
