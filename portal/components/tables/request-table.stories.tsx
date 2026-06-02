import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Showcase } from "@/.storybook/common";
import { toCSV } from "@/lib/pure/table-export";
import { BlobState, RequestRow, RequestTable, requestExportRows } from "./request-table";

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
const sampleFiles: { name: string; mime: string }[] = [
  { name: "report.pdf", mime: "application/pdf" },
  { name: "invoice.docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  { name: "scan.png", mime: "image/png" },
  { name: "notes.txt", mime: "text/plain" },
  { name: "slides.pptx", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
  { name: "data.xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  { name: "photo.jpg", mime: "image/jpeg" },
];

function generateRows(count: number): RequestRow[] {
  const rows: RequestRow[] = [];
  for (let i = 0; i < count; i++) {
    const age = i * 15 * MINUTE + Math.random() * 10 * MINUTE;
    const ts = new Date(now - age).toISOString();
    const isError = i % 11 === 7;
    const status = isError ? (i % 3 === 0 ? 500 : i % 3 === 1 ? 429 : 400) : 200;
    const kb = sizes[i % sizes.length];
    const id = `req-${String(i).padStart(3, "0")}`;
    const file = sampleFiles[i % sampleFiles.length];
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
      originalFilename: file.name,
      mimeType: file.mime,
      inputBytes: kb * 1024,
    });
  }
  return rows;
}

const realisticRows: RequestRow[] = [
  { id: "req-001", timestamp: new Date(now - 8_000).toISOString(), keyName: "agent-bold-crane", fileHash: "f4a1b2c3d4e5f6a7", billableKB: 2100, status: 202, result: processing, input: available("req-001", "input"), originalFilename: "annual-report-2025.pdf", mimeType: "application/pdf", inputBytes: 2_150_400 },
  { id: "req-002", timestamp: new Date(now - 3 * MINUTE).toISOString(), completedAt: new Date(now - 2 * MINUTE).toISOString(), keyName: "agent-bold-crane", fileHash: "a8b9c0d1e2f3a4b5", billableKB: 200, status: 200, result: available("req-002", "result"), input: available("req-002", "input"), originalFilename: "invoice-march.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", inputBytes: 204_800, steps: JSON.stringify([{ service: "gotenberg", duration_ms: 1200 }, { service: "docling", duration_ms: 3400 }]) },
  { id: "req-003", timestamp: new Date(now - 12 * MINUTE).toISOString(), completedAt: new Date(now - 12 * MINUTE + 500).toISOString(), keyName: "agent-quiet-raven", fileHash: "c6d7e8f9a0b1c2d3", billableKB: 100, status: 200, result: available("req-003", "result"), input: none, originalFilename: "scan-001.png", mimeType: "image/png", inputBytes: 98_304, steps: JSON.stringify([{ service: "docling", duration_ms: 480 }]) },
  { id: "req-004", timestamp: new Date(now - 25 * MINUTE).toISOString(), keyName: "agent-bold-crane", billableKB: 100, status: 400, result: none, input: none, detail: "Unsupported file type: application/x-executable" },
  { id: "req-004b", timestamp: new Date(now - 40 * MINUTE).toISOString(), completedAt: new Date(now - 40 * MINUTE + 200).toISOString(), keyName: "agent-quiet-raven", fileHash: "e4f5a6b7c8d9e0f1", billableKB: 100, status: 200, result: none, input: none, originalFilename: "memo.txt", mimeType: "text/plain", inputBytes: 12_288 },
  { id: "req-005", timestamp: new Date(now - 3 * HOUR).toISOString(), completedAt: new Date(now - 3 * HOUR + 11200).toISOString(), keyName: "agent-quiet-raven", fileHash: "1a2b3c4d5e6f7a8b", billableKB: 2600, status: 200, result: expired, input: expired, originalFilename: "contract-draft-v3.pdf", mimeType: "application/pdf", inputBytes: 2_662_400, steps: JSON.stringify([{ service: "docling", duration_ms: 9800 }, { service: "gpt-4o", duration_ms: 1400 }]) },
  { id: "req-006", timestamp: new Date(now - 5 * HOUR).toISOString(), completedAt: new Date(now - 5 * HOUR + 1800).toISOString(), keyName: "agent-swift-otter", fileHash: "9c0d1e2f3a4b5c6d", billableKB: 100, status: 200, result: none, input: none, originalFilename: "receipt.jpg", mimeType: "image/jpeg", inputBytes: 85_000 },
  { id: "req-007", timestamp: new Date(now - 6 * HOUR).toISOString(), keyName: "agent-bold-crane", billableKB: 400, status: 429, result: none, input: none, detail: "Rate limit exceeded. Try again in 60 seconds." },
  { id: "req-008", timestamp: new Date(now - DAY).toISOString(), completedAt: new Date(now - DAY + 6800).toISOString(), keyName: "agent-quiet-raven", fileHash: "7e8f9a0b1c2d3e4f", billableKB: 100, status: 200, result: none, input: none, originalFilename: "presentation.pptx", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", inputBytes: 102_400, steps: JSON.stringify([{ service: "gotenberg", duration_ms: 2100 }, { service: "docling", duration_ms: 4700 }]) },
  { id: "req-009", timestamp: new Date(now - 2 * DAY).toISOString(), keyName: "agent-swift-otter", fileHash: "5a6b7c8d9e0f1a2b", billableKB: 4200, status: 500, result: none, input: none, originalFilename: "huge-manual.pdf", mimeType: "application/pdf", inputBytes: 4_300_800, detail: "Processing timeout after 120s", steps: JSON.stringify([{ service: "docling", duration_ms: 120000, error: "timeout" }]) },
  { id: "req-010", timestamp: new Date(now - 3 * DAY).toISOString(), completedAt: new Date(now - 3 * DAY + 2100).toISOString(), keyName: "agent-bold-crane", fileHash: "3c4d5e6f7a8b9c0d", billableKB: 100, status: 200, result: expired, input: expired, originalFilename: "spreadsheet.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", inputBytes: 76_800, steps: JSON.stringify([{ service: "gotenberg", duration_ms: 900 }, { service: "docling", duration_ms: 1100 }]) },
];

export const RealisticAllStates: Story = {
  args: {
    onDelete: (id: string) => alert(`Delete ${id}`),
    requests: realisticRows,
  },
};

export const Paginated50Rows: Story = {
  args: {
    onDelete: (id: string) => alert(`Delete ${id}`),
    requests: generateRows(50),
  },
};

export const TargetedRow: Story = {
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
};

export const NoRequests: Story = {
  args: { requests: [] },
};

export const CSVPreview: Story = {
  args: { requests: [] },
  render: () => {
    const { headers, rows } = requestExportRows(realisticRows);
    return (
      <Showcase items={[
        {
          label: "CSV export preview",
          children: <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto">{toCSV(headers, rows)}</pre>,
        },
      ]} />
    );
  },
};
