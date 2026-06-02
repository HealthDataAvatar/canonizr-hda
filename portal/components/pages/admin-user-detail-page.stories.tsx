import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Showcase, TEST_EMAILS, TEST_KEY_NAMES } from "@/.storybook/common";
import { AdminUserDetailContent } from "./admin-user-detail-content";
import type { AdminUserDetail } from "@/lib/data/admin-page-data";
import type { RequestRow, BlobState } from "@/components/tables/request-table";

const now = Date.now();
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const none: BlobState = { status: "none" };

const recentJobs: RequestRow[] = [
  { id: "req-001", timestamp: new Date(now - 3 * MINUTE).toISOString(), completedAt: new Date(now - 2 * MINUTE).toISOString(), keyName: TEST_KEY_NAMES.crane, fileHash: "a8b9c0d1e2f3a4b5", billableKB: 200, status: 200, result: { status: "available", url: "#" }, input: none },
  { id: "req-002", timestamp: new Date(now - HOUR).toISOString(), keyName: TEST_KEY_NAMES.crane, billableKB: 100, status: 400, result: none, input: none },
  { id: "req-003", timestamp: new Date(now - 2 * DAY).toISOString(), completedAt: new Date(now - 2 * DAY + 6800).toISOString(), keyName: TEST_KEY_NAMES.raven, fileHash: "7e8f9a0b1c2d3e4f", billableKB: 2600, status: 200, result: none, input: none },
];

const activeUser: AdminUserDetail = {
  id: "u-001",
  email: TEST_EMAILS.short,
  joined: new Date(now - 60 * DAY).toISOString(),
  blocked: false,
  isAdmin: false,
  freeUnits: 500,
  maxKeys: 5,
  pricePerUnit: 0.003,
  spendCapKB: null,
  stripeCustomerId: "cus_abc123def456",
  keys: [
    { id: "key-aaa", displayName: TEST_KEY_NAMES.crane, value: "", usageKB: 3200, quotaKB: 10000 },
    { id: "key-bbb", displayName: TEST_KEY_NAMES.raven, value: "", usageKB: 800, quotaKB: 10000 },
  ],
  recentJobs,
  usageKB30d: 72000,
  totalInvoiced: 12.45,
};

const newUser: AdminUserDetail = {
  id: "u-002",
  email: "new@gmail.com",
  joined: new Date(now - DAY).toISOString(),
  blocked: false,
  isAdmin: false,
  freeUnits: 500,
  maxKeys: 3,
  pricePerUnit: 0.003,
  spendCapKB: null,
  stripeCustomerId: "",
  keys: [{ id: "key-ccc", displayName: "my-first-key", value: "", usageKB: 0, quotaKB: null }],
  recentJobs: [],
  usageKB30d: 0,
  totalInvoiced: 0,
};

const blockedUser: AdminUserDetail = {
  ...activeUser,
  id: "u-003",
  email: TEST_EMAILS.long,
  blocked: true,
  keys: [],
  recentJobs: recentJobs.slice(1),
  usageKB30d: 100,
  totalInvoiced: 0,
};

const meta = {
  title: "Pages/AdminUserDetail",
  component: AdminUserDetailContent,
} satisfies Meta<typeof AdminUserDetailContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllStates: Story = {
  args: { user: activeUser },
  render: () => (
    <Showcase
      items={[
        { label: "Active user with keys and jobs", children: <AdminUserDetailContent user={activeUser} /> },
        { label: "New user (no jobs)", children: <AdminUserDetailContent user={newUser} /> },
        { label: "Blocked user (long email, no keys)", children: <AdminUserDetailContent user={blockedUser} /> },
      ]}
    />
  ),
};
