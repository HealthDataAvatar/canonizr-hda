import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Showcase, TEST_KEY_NAMES, TEST_KEY_VALUES } from "@/.storybook/common";
import { JobsPageContent } from "./jobs-page-content";
import { UploadForm, KeySelector, type KeyOption } from "@/components/upload-form";
import type { RequestRow, BlobState } from "@/components/tables/request-table";

const now = Date.now();
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const none: BlobState = { status: "none" };
const expired: BlobState = { status: "expired" };
const processing: BlobState = { status: "processing" };
const available = (id: string, type: "result" | "input"): BlobState => ({
  status: "available",
  url: `/api/jobs/${id}/${type}`,
});

const requests: RequestRow[] = [
  { id: "req-001", timestamp: new Date(now - 8_000).toISOString(), keyName: TEST_KEY_NAMES.crane, fileHash: "f4a1b2c3d4e5f6a7", billableKB: 2100, status: 202, result: processing, input: available("req-001", "input") },
  { id: "req-002", timestamp: new Date(now - 3 * MINUTE).toISOString(), completedAt: new Date(now - 2 * MINUTE).toISOString(), keyName: TEST_KEY_NAMES.crane, fileHash: "a8b9c0d1e2f3a4b5", billableKB: 200, status: 200, result: available("req-002", "result"), input: available("req-002", "input") },
  { id: "req-003", timestamp: new Date(now - 12 * MINUTE).toISOString(), completedAt: new Date(now - 12 * MINUTE + 500).toISOString(), keyName: TEST_KEY_NAMES.raven, fileHash: "c6d7e8f9a0b1c2d3", billableKB: 100, status: 200, result: available("req-003", "result"), input: none },
  { id: "req-004", timestamp: new Date(now - 25 * MINUTE).toISOString(), keyName: TEST_KEY_NAMES.crane, billableKB: 100, status: 400, result: none, input: none },
  { id: "req-005", timestamp: new Date(now - 3 * HOUR).toISOString(), completedAt: new Date(now - 3 * HOUR + 11200).toISOString(), keyName: TEST_KEY_NAMES.raven, fileHash: "1a2b3c4d5e6f7a8b", billableKB: 2600, status: 200, result: expired, input: expired },
  { id: "req-006", timestamp: new Date(now - DAY).toISOString(), keyName: TEST_KEY_NAMES.otter, billableKB: 400, status: 429, result: none, input: none },
  { id: "req-007", timestamp: new Date(now - 2 * DAY).toISOString(), keyName: TEST_KEY_NAMES.otter, fileHash: "5a6b7c8d9e0f1a2b", billableKB: 4200, status: 500, result: none, input: none },
];

const sampleKeys: KeyOption[] = [
  { id: "1", displayName: TEST_KEY_NAMES.crane, key: TEST_KEY_VALUES.key1, usageKB: 3200, quotaKB: 10000 },
  { id: "2", displayName: TEST_KEY_NAMES.raven, key: TEST_KEY_VALUES.key2, usageKB: 800, quotaKB: 10000 },
];

const uploadSlot = (
  <UploadForm keySelectorSlot={<KeySelector keys={sampleKeys} />} />
);

const meta = {
  title: "Pages/Jobs",
  component: JobsPageContent,
} satisfies Meta<typeof JobsPageContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllStates: Story = {
  args: { initialRequests: requests, uploadSlot },
  render: () => (
    <Showcase
      items={[
        {
          label: "With requests (mixed statuses)",
          children: <JobsPageContent initialRequests={requests} uploadSlot={uploadSlot} />,
        },
        {
          label: "Empty",
          children: <JobsPageContent initialRequests={[]} uploadSlot={uploadSlot} />,
        },
      ]}
    />
  ),
};
