import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { RequestTable, type BlobState, type RequestRow } from "./request-table";

const meta = {
  title: "Components/RequestTable",
  component: RequestTable,
} satisfies Meta<typeof RequestTable>;

export default meta;
type Story = StoryObj<typeof meta>;

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

const keys = ["agent-bold-crane", "agent-quiet-raven", "agent-swift-otter"];
const sizes = [100, 200, 400, 800, 1200, 2600, 4200];

function generateRows(count: number): RequestRow[] {
  const rows: RequestRow[] = [];
  for (let i = 0; i < count; i++) {
    const age = i * 15 * MINUTE + Math.random() * 10 * MINUTE;
    const ts = new Date(now - age).toISOString();
    const isError = i % 11 === 7;
    const status = isError ? (i % 3 === 0 ? 500 : i % 3 === 1 ? 429 : 400) : 200;
    const kb = sizes[i % sizes.length];
    const id = `req-${String(i).padStart(3, "0")}`;
    rows.push({
      id,
      timestamp: ts,
      completedAt: status === 200 ? new Date(now - age + 2000).toISOString() : undefined,
      keyName: keys[i % keys.length],
      fileHash: isError ? undefined : `${i.toString(16).padStart(4, "0")}a1b2c3d4e5f6`,
      billableKB: kb,
      status,
      result: status === 200 && i < 5 ? available(id, "result") : i < 15 && status === 200 ? expired : none,
      input: status === 200 && i < 3 ? available(id, "input") : none,
    });
  }
  return rows;
}

const realisticRows: RequestRow[] = [
  { id: "req-001", timestamp: new Date(now - 8_000).toISOString(), keyName: "agent-bold-crane", fileHash: "f4a1b2c3d4e5f6a7", billableKB: 2100, status: 202, result: processing, input: available("req-001", "input") },
  { id: "req-002", timestamp: new Date(now - 3 * MINUTE).toISOString(), completedAt: new Date(now - 2 * MINUTE).toISOString(), keyName: "agent-bold-crane", fileHash: "a8b9c0d1e2f3a4b5", billableKB: 200, status: 200, result: available("req-002", "result"), input: available("req-002", "input") },
  { id: "req-003", timestamp: new Date(now - 12 * MINUTE).toISOString(), completedAt: new Date(now - 12 * MINUTE + 500).toISOString(), keyName: "agent-quiet-raven", fileHash: "c6d7e8f9a0b1c2d3", billableKB: 100, status: 200, result: available("req-003", "result"), input: none },
  { id: "req-004", timestamp: new Date(now - 25 * MINUTE).toISOString(), keyName: "agent-bold-crane", billableKB: 100, status: 400, result: none, input: none },
  { id: "req-004b", timestamp: new Date(now - 40 * MINUTE).toISOString(), completedAt: new Date(now - 40 * MINUTE + 200).toISOString(), keyName: "agent-quiet-raven", fileHash: "e4f5a6b7c8d9e0f1", billableKB: 100, status: 200, result: none, input: none },
  { id: "req-005", timestamp: new Date(now - 3 * HOUR).toISOString(), completedAt: new Date(now - 3 * HOUR + 11200).toISOString(), keyName: "agent-quiet-raven", fileHash: "1a2b3c4d5e6f7a8b", billableKB: 2600, status: 200, result: expired, input: expired },
  { id: "req-006", timestamp: new Date(now - 5 * HOUR).toISOString(), completedAt: new Date(now - 5 * HOUR + 1800).toISOString(), keyName: "agent-swift-otter", fileHash: "9c0d1e2f3a4b5c6d", billableKB: 100, status: 200, result: none, input: none },
  { id: "req-007", timestamp: new Date(now - 6 * HOUR).toISOString(), keyName: "agent-bold-crane", billableKB: 400, status: 429, result: none, input: none },
  { id: "req-008", timestamp: new Date(now - DAY).toISOString(), completedAt: new Date(now - DAY + 6800).toISOString(), keyName: "agent-quiet-raven", fileHash: "7e8f9a0b1c2d3e4f", billableKB: 100, status: 200, result: none, input: none },
  { id: "req-009", timestamp: new Date(now - 2 * DAY).toISOString(), keyName: "agent-swift-otter", fileHash: "5a6b7c8d9e0f1a2b", billableKB: 4200, status: 500, result: none, input: none },
  { id: "req-010", timestamp: new Date(now - 3 * DAY).toISOString(), completedAt: new Date(now - 3 * DAY + 2100).toISOString(), keyName: "agent-bold-crane", fileHash: "3c4d5e6f7a8b9c0d", billableKB: 100, status: 200, result: expired, input: expired },
];

export const Realistic: Story = {
  name: "Realistic usage (all states)",
  args: {
    onDelete: (id: string) => alert(`Delete ${id}`),
    requests: realisticRows,
  },
};

export const Paginated: Story = {
  name: "Paginated (50 rows)",
  args: {
    onDelete: (id: string) => alert(`Delete ${id}`),
    requests: generateRows(50),
  },
};

export const Targeted: Story = {
  name: "Targeted row (via anchor)",
  args: { requests: [] },
  render: () => (
    <RequestTable
      requests={[
        { id: "req-ok", timestamp: new Date(now - 5 * MINUTE).toISOString(), completedAt: new Date(now - 4 * MINUTE).toISOString(), keyName: "agent-bold-crane", fileHash: "a1b2c3d4e5f6a7b8", billableKB: 200, status: 200, result: none, input: none },
        { id: "req-targeted", timestamp: new Date(now - 8 * MINUTE).toISOString(), keyName: "agent-bold-crane", billableKB: 100, status: 400, result: none, input: none },
        { id: "req-ok-2", timestamp: new Date(now - HOUR).toISOString(), completedAt: new Date(now - HOUR + 11200).toISOString(), keyName: "agent-quiet-raven", fileHash: "c3d4e5f6a7b8c9d0", billableKB: 2600, status: 200, result: none, input: none },
      ]}
    />
  ),
  decorators: [
    (Story) => (
      <>
        <p className="mb-4 text-sm text-muted-foreground">
          The error row below simulates the <code>:target</code> state (highlighted via anchor link from the error banner).
        </p>
        <style>{`#req-targeted { background: var(--accent-subtle); }`}</style>
        <Story />
      </>
    ),
  ],
};

export const Empty: Story = {
  name: "No requests",
  args: { requests: [] },
};
