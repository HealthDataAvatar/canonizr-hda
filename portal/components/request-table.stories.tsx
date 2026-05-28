import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { RequestTable, type BlobState } from "./request-table";

const meta = {
  title: "Components/RequestTable",
  component: RequestTable,
} satisfies Meta<typeof RequestTable>;

export default meta;
type Story = StoryObj<typeof meta>;

const now = Date.now();
const none: BlobState = { status: "none" };
const expired: BlobState = { status: "expired" };
const available = (id: string, type: "result" | "input"): BlobState => ({
  status: "available",
  url: `/api/jobs/${id}/${type}`,
});

export const WithRequests: Story = {
  args: {
    requests: [
      { id: "req-a1b2c3", timestamp: new Date(now - 5 * 60_000).toISOString(), keyName: "agent-bold-crane", inputSizeBytes: 127283, processingTimeMs: 2340, pipeline: "docling+caption", status: 200, result: none, input: none },
      { id: "req-d4e5f6", timestamp: new Date(now - 7 * 60_000).toISOString(), keyName: "agent-bold-crane", inputSizeBytes: 8291, processingTimeMs: 420, pipeline: "passthrough", status: 200, result: none, input: none },
      { id: "req-g7h8i9", timestamp: new Date(now - 30 * 60_000).toISOString(), keyName: "agent-quiet-raven", inputSizeBytes: 2516582, processingTimeMs: 11200, pipeline: "docling+caption", status: 200, result: none, input: none },
      { id: "req-j0k1l2", timestamp: new Date(now - 35 * 60_000).toISOString(), keyName: "agent-bold-crane", inputSizeBytes: 0, processingTimeMs: 12, pipeline: "—", status: 400, result: none, input: none },
    ],
  },
};

export const WithDownloads: Story = {
  name: "With downloads (available, expired, none)",
  args: {
    onDelete: (id: string) => alert(`Delete ${id}`),
    requests: [
      { id: "req-a1b2c3", timestamp: new Date(now - 5 * 60_000).toISOString(), keyName: "agent-bold-crane", inputSizeBytes: 127283, processingTimeMs: 2340, pipeline: "docling+caption", status: 200, result: available("req-a1b2c3", "result"), input: available("req-a1b2c3", "input") },
      { id: "req-d4e5f6", timestamp: new Date(now - 7 * 60_000).toISOString(), keyName: "agent-bold-crane", inputSizeBytes: 8291, processingTimeMs: 420, pipeline: "passthrough", status: 200, result: expired, input: expired },
      { id: "req-j0k1l2", timestamp: new Date(now - 35 * 60_000).toISOString(), keyName: "agent-bold-crane", inputSizeBytes: 0, processingTimeMs: 12, pipeline: "—", status: 400, result: none, input: none },
    ],
  },
};

export const WithError: Story = {
  args: {
    requests: [
      { id: "req-a1b2c3", timestamp: new Date(now - 2 * 60_000).toISOString(), keyName: "agent-bold-crane", inputSizeBytes: 127283, processingTimeMs: 2340, pipeline: "docling+caption", status: 200, result: none, input: none },
      { id: "req-j0k1l2", timestamp: new Date(now - 3 * 60_000).toISOString(), keyName: "agent-bold-crane", inputSizeBytes: 0, processingTimeMs: 12, pipeline: "—", status: 400, result: none, input: none },
      { id: "req-g7h8i9", timestamp: new Date(now - 60 * 60_000).toISOString(), keyName: "agent-quiet-raven", inputSizeBytes: 2516582, processingTimeMs: 11200, pipeline: "docling+caption", status: 200, result: none, input: none },
    ],
  },
};

export const Targeted: Story = {
  name: "Targeted row (via anchor)",
  render: () => (
    <RequestTable
      requests={[
        { id: "req-ok", timestamp: new Date(now - 5 * 60_000).toISOString(), keyName: "agent-bold-crane", inputSizeBytes: 127283, processingTimeMs: 2340, pipeline: "docling+caption", status: 200, result: none, input: none },
        { id: "req-targeted", timestamp: new Date(now - 8 * 60_000).toISOString(), keyName: "agent-bold-crane", inputSizeBytes: 0, processingTimeMs: 12, pipeline: "—", status: 400, result: none, input: none },
        { id: "req-ok-2", timestamp: new Date(now - 60 * 60_000).toISOString(), keyName: "agent-quiet-raven", inputSizeBytes: 2516582, processingTimeMs: 11200, pipeline: "docling+caption", status: 200, result: none, input: none },
      ]}
    />
  ),
  decorators: [
    (Story) => (
      <>
        <p className="mb-4 text-[0.8125rem] text-muted-foreground">
          The error row below simulates the <code>:target</code> state (highlighted via anchor link from the error banner).
        </p>
        <style>{`#req-targeted { background: var(--accent-subtle); }`}</style>
        <Story />
      </>
    ),
  ],
};

export const Processing: Story = {
  name: "Job still processing",
  args: {
    requests: [
      { id: "req-new", timestamp: new Date(now - 5 * 1000).toISOString(), keyName: "agent-bold-crane", inputSizeBytes: 2100000, processingTimeMs: 0, pipeline: "docling+caption", status: 202, result: { status: "processing" }, input: available("req-new", "input") },
      { id: "req-a1b2c3", timestamp: new Date(now - 5 * 60_000).toISOString(), keyName: "agent-bold-crane", inputSizeBytes: 127283, processingTimeMs: 2340, pipeline: "docling+caption", status: 200, result: available("req-a1b2c3", "result"), input: available("req-a1b2c3", "input") },
    ],
  },
};

export const SingleRequest: Story = {
  args: {
    requests: [
      { id: "req-only", timestamp: new Date(now - 2 * 60_000).toISOString(), keyName: "agent-swift-otter", inputSizeBytes: 54200, processingTimeMs: 1800, pipeline: "docling", status: 200, result: none, input: none },
    ],
  },
};
