import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { generateSyntheticUser, Showcase } from "@/.storybook/common";
import { toCSV } from "@/lib/pure/table-export";
import { CanonizeUserJobTable, requestExportRows } from "./canonize-user-job-table";
import { CanonizeJobRow } from "@/lib/pure/job-types";
import { toCanonizeJobRow } from "@/lib/data/jobs";
import { JobRecord } from "@/lib/data/table-interface";

const meta = {
  title: "Components/RequestTable",
  component: CanonizeUserJobTable,
} satisfies Meta<typeof CanonizeUserJobTable>;

export default meta;
type Story = StoryObj<typeof meta>;

const now = Date.now();
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function generateRows(count: number): CanonizeJobRow[] {
  const { jobs } = generateSyntheticUser({ seed: 42, count: 15 });
  return jobs.map(toCanonizeJobRow);
}

export const RealisticAllStates: Story = {
  args: {
    onDelete: (id: string) => alert(`Delete ${id}`),
    jobs: generateRows(10),
  },
};

export const Paginated50Rows: Story = {
  args: {
    onDelete: (id: string) => alert(`Delete ${id}`),
    jobs: generateRows(50),
  },
};

export const NoRequests: Story = {
  args: { jobs: [] },
};

/** Single completed PDF job with every artefact type: text, pages, previews, images, tables. */
const fullManifestRow: CanonizeJobRow = {
  id: "demo-full-manifest",
  keyId: "key-aaa",
  filename: "annual-report-2025.pdf",
  mimeType: "application/pdf",
  inputBytes: 2_200_000,
  pricePerUnit: 0.003,
  submittedAt: new Date(now - 5 * MINUTE).toISOString(),
  status: "ok",
  completedAt: new Date(now - 4 * MINUTE).toISOString(),
  expiresAt: new Date(now + 23 * HOUR).toISOString(),
  artefacts: [
    { name: "markdown", mime_type: "text/markdown", size_bytes: 21_400 },
    // Pages + previews (6 pages)
    { name: "page-1", mime_type: "image/png", size_bytes: 387_590 },
    { name: "preview-1", mime_type: "image/webp", size_bytes: 8_200 },
    { name: "page-2", mime_type: "image/png", size_bytes: 470_770 },
    { name: "preview-2", mime_type: "image/webp", size_bytes: 9_100 },
    { name: "page-3", mime_type: "image/png", size_bytes: 371_760 },
    { name: "preview-3", mime_type: "image/webp", size_bytes: 7_800 },
    { name: "page-4", mime_type: "image/png", size_bytes: 283_380 },
    { name: "preview-4", mime_type: "image/webp", size_bytes: 6_500 },
    { name: "page-5", mime_type: "image/png", size_bytes: 123_410 },
    { name: "preview-5", mime_type: "image/webp", size_bytes: 5_200 },
    { name: "page-6", mime_type: "image/png", size_bytes: 592_640 },
    { name: "preview-6", mime_type: "image/webp", size_bytes: 11_300 },
    // Extracted images
    { name: "image-1", mime_type: "image/png", size_bytes: 227_150, label: "Bar chart", source_page: 2 },
    { name: "image-2", mime_type: "image/png", size_bytes: 53_260, label: "Company logo", source_page: 1 },
    { name: "image-3", mime_type: "image/png", size_bytes: 156_050, label: "Photograph", source_page: 4 },
    { name: "image-4", mime_type: "image/png", size_bytes: 169_990, label: "Pie chart", source_page: 5 },
    // Extracted tables
    { name: "table-1", mime_type: "application/json", size_bytes: 3_400, source_page: 2 },
    { name: "table-2", mime_type: "application/json", size_bytes: 5_800, source_page: 4 },
    { name: "table-3", mime_type: "application/json", size_bytes: 2_100, source_page: 6 },
  ],
};

export const FullManifest: Story = {
  args: {
    onDelete: (id: string) => alert(`Delete ${id}`),
    artefactUrl: (jobId: string, name: string) => `#${jobId}/${name}`,
    jobs: [fullManifestRow],
  },
};

export const CSVPreview: Story = {
  args: { jobs: [] },
  render: () => {
    const { headers, rows } = requestExportRows(generateRows(10));
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
