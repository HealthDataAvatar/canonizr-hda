import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Showcase } from "@/.storybook/common";
import { TraceFlame } from "./trace-flame";
import type { SpanNode } from "@/lib/pure/trace";

const meta = {
  title: "Components/TraceFlame",
  component: TraceFlame,
} satisfies Meta<typeof TraceFlame>;

export default meta;
type Story = StoryObj<typeof meta>;

const simplePdf: SpanNode = {
  name: "worker",
  offset_ms: 0,
  duration_ms: 4500,
  attributes: { file_size_bytes: 204800, mime_type: "application/pdf" },
  children: [
    { name: "docling", offset_ms: 0, duration_ms: 4500, attributes: {} },
  ],
};

const pdfWithCaptioning: SpanNode = {
  name: "worker",
  offset_ms: 0,
  duration_ms: 12400,
  attributes: { file_size_bytes: 1048576, mime_type: "application/pdf" },
  children: [
    { name: "extract_pages", offset_ms: 0, duration_ms: 320, attributes: {} },
    {
      name: "captioning",
      offset_ms: 320,
      duration_ms: 8200,
      attributes: { service: "openai/gpt-4o", page_count: 4 },
      children: [
        { name: "page[0]", offset_ms: 320, duration_ms: 2100, attributes: { prompt_tokens: 800, completion_tokens: 200, images_captioned: 1 } },
        { name: "page[1]", offset_ms: 400, duration_ms: 1900, attributes: { prompt_tokens: 650, completion_tokens: 180, images_captioned: 1 } },
        { name: "page[2]", offset_ms: 480, duration_ms: 2200, attributes: { prompt_tokens: 920, completion_tokens: 250, images_captioned: 1 } },
        { name: "page[3]", offset_ms: 2500, duration_ms: 2000, attributes: { prompt_tokens: 710, completion_tokens: 190, images_captioned: 1 } },
      ],
    },
    { name: "docling", offset_ms: 8520, duration_ms: 3880, attributes: {} },
  ],
};

const legacyDocConversion: SpanNode = {
  name: "worker",
  offset_ms: 0,
  duration_ms: 18500,
  attributes: { file_size_bytes: 524288, mime_type: "application/msword" },
  children: [
    { name: "gotenberg", offset_ms: 0, duration_ms: 6200, attributes: { total_retries: 1, total_retry_delay_ms: 2000 } },
    { name: "docling", offset_ms: 6200, duration_ms: 9800, attributes: {} },
    {
      name: "captioning",
      offset_ms: 16000,
      duration_ms: 2500,
      attributes: { service: "openai/gpt-4o" },
      children: [
        { name: "page[0]", offset_ms: 16000, duration_ms: 2500, attributes: { prompt_tokens: 1200, completion_tokens: 350, images_captioned: 1 } },
      ],
    },
  ],
};

const passthrough: SpanNode = {
  name: "worker",
  offset_ms: 0,
  duration_ms: 45,
  attributes: { file_size_bytes: 1024, mime_type: "text/plain" },
  children: [
    { name: "passthrough", offset_ms: 0, duration_ms: 45, attributes: {} },
  ],
};

const markitdown: SpanNode = {
  name: "worker",
  offset_ms: 0,
  duration_ms: 1800,
  attributes: { file_size_bytes: 32768, mime_type: "text/html" },
  children: [
    { name: "markitdown", offset_ms: 0, duration_ms: 1800, attributes: {} },
  ],
};

export const AllStates: Story = {
  args: { trace: simplePdf },
  render: () => (
    <Showcase
      items={[
        { label: "Simple PDF (docling only)", children: <TraceFlame trace={simplePdf} /> },
        { label: "PDF with captioning (4 concurrent pages)", children: <TraceFlame trace={pdfWithCaptioning} /> },
        { label: "Legacy .doc (Gotenberg + Docling + captioning, with retry)", children: <TraceFlame trace={legacyDocConversion} /> },
        { label: "Passthrough (text/plain)", children: <TraceFlame trace={passthrough} /> },
        { label: "MarkItDown (HTML)", children: <TraceFlame trace={markitdown} /> },
      ]}
    />
  ),
};

export const Interactive: Story = {
  args: { trace: pdfWithCaptioning },
  parameters: {
    docs: { description: { story: "Click a bar to zoom in, use controls to zoom out." } },
  },
};
