import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Showcase } from "@/.storybook/common";
import { PreviewStrip } from "./preview-strip";
import type { ArtefactEntry } from "@/lib/pure/artefacts";

const meta = {
  title: "UI/PreviewStrip",
  component: PreviewStrip,
} satisfies Meta<typeof PreviewStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

function makePreviews(count: number): ArtefactEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `preview-${i + 1}`,
    mime_type: "image/webp",
    size_bytes: 6000 + Math.round(Math.random() * 5000),
  }));
}

const dummyUrl = (jobId: string, name: string) => `#${jobId}/${name}`;

export const AllStates: Story = {
  args: { previews: [], jobId: "", artefactUrl: undefined },
  render: () => (
    <Showcase
      items={[
        {
          label: "6 pages with URLs",
          children: (
            <PreviewStrip
              previews={makePreviews(6)}
              jobId="demo-job-1"
              artefactUrl={dummyUrl}
            />
          ),
        },
        {
          label: "20 pages (horizontal scroll)",
          children: (
            <PreviewStrip
              previews={makePreviews(20)}
              jobId="demo-job-2"
              artefactUrl={dummyUrl}
            />
          ),
        },
        {
          label: "No artefactUrl (placeholder thumbnails)",
          children: (
            <PreviewStrip
              previews={makePreviews(4)}
              jobId="demo-job-3"
            />
          ),
        },
        {
          label: "Single page",
          children: (
            <PreviewStrip
              previews={makePreviews(1)}
              jobId="demo-job-4"
              artefactUrl={dummyUrl}
            />
          ),
        },
      ]}
    />
  ),
};
