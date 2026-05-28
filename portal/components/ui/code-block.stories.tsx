import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CodeBlock } from "./code-block";

const meta = {
  title: "UI/CodeBlock",
  component: CodeBlock,
} satisfies Meta<typeof CodeBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SingleLanguage: Story = {
  args: {
    samples: [
      {
        language: "bash",
        code: `curl -X POST https://api.canonizr.com/convert \\
  -H "Ocp-Apim-Subscription-Key: YOUR_API_KEY" \\
  -F "file=@document.pdf"`,
      },
    ],
  },
};

export const MultiLanguage: Story = {
  args: {
    samples: [
      {
        language: "bash",
        code: `curl -X POST https://api.canonizr.com/convert \\
  -H "Ocp-Apim-Subscription-Key: YOUR_API_KEY" \\
  -F "file=@document.pdf"`,
      },
      {
        language: "python",
        code: `import requests

response = requests.post(
    "https://api.canonizr.com/convert",
    headers={"Ocp-Apim-Subscription-Key": "YOUR_API_KEY"},
    files={"file": open("document.pdf", "rb")},
)
print(response.text)`,
      },
      {
        language: "javascript",
        code: `const form = new FormData();
form.append("file", fs.createReadStream("document.pdf"));

const res = await fetch("https://api.canonizr.com/convert", {
  method: "POST",
  headers: { "Ocp-Apim-Subscription-Key": "YOUR_API_KEY" },
  body: form,
});
console.log(await res.text());`,
      },
    ],
  },
};

export const Overflow: Story = {
  decorators: [(Story) => <div className="max-w-sm"><Story /></div>],
  args: {
    samples: [
      {
        language: "python",
        code: `import requests
import json
from pathlib import Path

# Convert a batch of documents with detailed error handling and retry logic
API_URL = "https://api.canonizr.com/convert"
API_KEY = "your-very-long-api-key-that-extends-well-beyond-the-visible-area-of-the-code-block-container"

def convert_document(file_path: str, output_dir: str = "./output") -> dict:
    """Convert a single document to markdown with full metadata extraction and captioning enabled."""
    headers = {"Ocp-Apim-Subscription-Key": API_KEY, "Accept": "application/json", "X-Request-Id": "batch-run-2026-05-28"}
    with open(file_path, "rb") as f:
        response = requests.post(API_URL, headers=headers, files={"file": f}, timeout=120)
        response.raise_for_status()
    result = response.json()
    output_path = Path(output_dir) / f"{Path(file_path).stem}.md"
    output_path.write_text(result["markdown"])
    print(f"Converted {file_path} -> {output_path} ({response.headers.get('X-Input-Size-Bytes', '?')} bytes, {response.headers.get('X-Processing-Time-Ms', '?')}ms)")
    return result

for doc in ["report.pdf", "slides.pptx", "manual.docx", "scan.png", "invoice.pdf", "contract.pdf", "whitepaper.pdf", "presentation.pdf"]:
    try:
        convert_document(doc)
    except requests.HTTPError as e:
        print(f"Failed to convert {doc}: {e.response.status_code} {e.response.text}")`,
      },
    ],
  },
};

export const Inset: Story = {
  args: {
    variant: "inset",
    samples: [
      {
        language: "bash",
        code: `curl -X POST https://api.canonizr.com/convert \\
  -H "Ocp-Apim-Subscription-Key: YOUR_API_KEY" \\
  -F "file=@document.pdf"`,
      },
    ],
  },
};
