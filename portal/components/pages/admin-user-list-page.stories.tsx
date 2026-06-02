import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Showcase, TEST_EMAILS } from "@/.storybook/common";
import { AdminUserListContent } from "./admin-user-list-content";
import type { AdminUserRow } from "@/lib/data/admin-page-data";

const now = new Date();
const DAY = 24 * 60 * 60_000;

const users: AdminUserRow[] = [
  { id: "u-001", email: TEST_EMAILS.short, keyCount: 3, jobCount30d: 142, errorCount30d: 2, usageKB30d: 72000, blocked: false, joined: new Date(now.getTime() - 60 * DAY).toISOString(), stripeCustomerId: "cus_abc123" },
  { id: "u-002", email: "dev@startup.io", keyCount: 1, jobCount30d: 8, errorCount30d: 0, usageKB30d: 800, blocked: false, joined: new Date(now.getTime() - 3 * DAY).toISOString(), stripeCustomerId: "cus_def456" },
  { id: "u-003", email: TEST_EMAILS.long, keyCount: 2, jobCount30d: 0, errorCount30d: 0, usageKB30d: 0, blocked: true, joined: new Date(now.getTime() - 120 * DAY).toISOString(), stripeCustomerId: "" },
  { id: "u-004", email: "power@enterprise.com", keyCount: 5, jobCount30d: 1200, errorCount30d: 15, usageKB30d: 450000, blocked: false, joined: new Date(now.getTime() - 200 * DAY).toISOString(), stripeCustomerId: "cus_ghi789" },
  { id: "u-005", email: "new@gmail.com", keyCount: 1, jobCount30d: 0, errorCount30d: 0, usageKB30d: 0, blocked: false, joined: new Date(now.getTime() - DAY).toISOString(), stripeCustomerId: "" },
];

const meta = {
  title: "Pages/AdminUserList",
  component: AdminUserListContent,
} satisfies Meta<typeof AdminUserListContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllStates: Story = {
  args: { users },
  render: () => (
    <Showcase
      items={[
        { label: "Multiple users (mixed status)", children: <AdminUserListContent users={users} /> },
        { label: "Single user", children: <AdminUserListContent users={users.slice(0, 1)} /> },
        { label: "Empty", children: <AdminUserListContent users={[]} /> },
      ]}
    />
  ),
};
