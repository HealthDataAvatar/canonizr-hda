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
