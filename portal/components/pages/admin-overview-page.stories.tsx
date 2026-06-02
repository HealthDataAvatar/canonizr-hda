import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Showcase } from "@/.storybook/common";
import { AdminOverviewContent } from "./admin-overview-content";
import type { AdminOverview } from "@/lib/data/admin-overview-data";

const meta = {
  title: "Pages/AdminOverview",
  component: AdminOverviewContent,
} satisfies Meta<typeof AdminOverviewContent>;

export default meta;
type Story = StoryObj<typeof meta>;

const idle: AdminOverview = {
  queueLength: 0,
  queueSizeKB: 0,
  inFlightJobs: 0,
  oldestWaitingSince: null,
  jobsToday: 42,
  jobsErrorToday: 0,
  totalUsers: 18,
};

const active: AdminOverview = {
  queueLength: 7,
  queueSizeKB: 14200,
  inFlightJobs: 3,
  oldestWaitingSince: new Date(Date.now() - 45_000).toISOString(),
  jobsToday: 156,
  jobsErrorToday: 4,
  totalUsers: 83,
};

const highErrors: AdminOverview = {
  queueLength: 12,
  queueSizeKB: 48000,
  inFlightJobs: 1,
  oldestWaitingSince: new Date(Date.now() - 5 * 60_000).toISOString(),
  jobsToday: 200,
  jobsErrorToday: 38,
  totalUsers: 83,
};

const fresh: AdminOverview = {
  queueLength: 0,
  queueSizeKB: 0,
  inFlightJobs: 0,
  oldestWaitingSince: null,
  jobsToday: 0,
  jobsErrorToday: 0,
  totalUsers: 1,
};

export const AllStates: Story = {
  args: { overview: idle },
  render: () => (
    <Showcase
      items={[
        { label: "Idle (empty queue)", children: <AdminOverviewContent overview={idle} /> },
        { label: "Active (jobs in queue)", children: <AdminOverviewContent overview={active} /> },
        { label: "High error rate", children: <AdminOverviewContent overview={highErrors} /> },
        { label: "Fresh deployment (no data)", children: <AdminOverviewContent overview={fresh} /> },
      ]}
    />
  ),
};
