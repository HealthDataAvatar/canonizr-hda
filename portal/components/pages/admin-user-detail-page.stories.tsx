import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Showcase, TEST_EMAILS, TEST_KEY_NAMES } from "@/.storybook/common";
import { AdminUserDetailContent } from "./admin-user-detail-content";
import type { AdminUserDetail } from "@/lib/data/admin-page-data";

const now = Date.now();
const DAY = 24 * 60 * 60_000;

const activeUser: AdminUserDetail = {
  id: "u-001",
  email: TEST_EMAILS.short,
  joined: new Date(now - 60 * DAY).toISOString(),
  blocked: false,
  isAdmin: false,
  freeUnits: 500,
  maxKeys: 5,
  pricePerUnit: 0.003,
  spendCapUnits: null,
  adminCapUnits: null,
  paidEnabled: false,
  stripeCustomerId: "cus_abc123def456",
  keys: [
    { id: "key-aaa", displayName: TEST_KEY_NAMES.crane, value: "", usageKB: 3200, quotaKB: 10000 },
    { id: "key-bbb", displayName: TEST_KEY_NAMES.raven, value: "", usageKB: 800, quotaKB: 10000 },
  ],
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
  spendCapUnits: null,
  adminCapUnits: null,
  paidEnabled: false,
  stripeCustomerId: "",
  keys: [{ id: "key-ccc", displayName: "my-first-key", value: "", usageKB: 0, quotaKB: null }],
  usageKB30d: 0,
  totalInvoiced: 0,
};

const blockedUser: AdminUserDetail = {
  ...activeUser,
  id: "u-003",
  email: TEST_EMAILS.long,
  blocked: true,
  keys: [],
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
