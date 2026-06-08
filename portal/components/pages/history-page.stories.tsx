import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Showcase, TEST_KEY_NAMES, TEST_KEY_VALUES, generateSyntheticUser } from "@/.storybook/common";
import { toCanonizeJobRow } from "@/lib/data/jobs";
import { JobsPageContent } from "./jobs-page-content";
import { UploadForm, KeySelector, type KeyOption } from "@/components/upload-form";

const { jobs: rawJobs } = generateSyntheticUser({ seed: 99, count: 10 });
const jobs = rawJobs.map(toCanonizeJobRow);

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
  args: { initialRequests: jobs, initialCursor: null, uploadSlot },
  render: () => (
    <Showcase
      items={[
        {
          label: "With jobs (mixed statuses)",
          children: <JobsPageContent initialRequests={jobs} initialCursor={null} uploadSlot={uploadSlot} />,
        },
        {
          label: "Empty",
          children: <JobsPageContent initialRequests={[]} initialCursor={null} uploadSlot={uploadSlot} />,
        },
      ]}
    />
  ),
};
