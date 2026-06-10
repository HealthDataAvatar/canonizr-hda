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
    highlight: ["YOUR_API_KEY"],
    samples: [
      {
        language: "bash",
        code: `# Submit
JOB_ID=$(curl -s -X POST https://gateway.canonizr.com/convert \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -F "file=@document.pdf" | jq -r .job_id)

# Poll for result
while true; do
  RESULT=$(curl -s -w "\\n%{http_code}" \\
    https://gateway.canonizr.com/result/$JOB_ID \\
    -H "Authorization: Bearer YOUR_API_KEY")
  CODE=$(echo "$RESULT" | tail -1)
  [ "$CODE" = "200" ] && { echo "$RESULT" | head -1 | jq .markdown; break; }
  [ "$CODE" = "202" ] && sleep 2 || { echo "Error: $RESULT"; break; }
done`,
      },
    ],
  },
};

export const MultiLanguage: Story = {
  args: {
    highlight: ["YOUR_API_KEY"],
    samples: [
      {
        language: "bash",
        code: `# Submit
JOB_ID=$(curl -s -X POST https://gateway.canonizr.com/convert \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -F "file=@document.pdf" | jq -r .job_id)

# Poll for result
while true; do
  RESULT=$(curl -s -w "\\n%{http_code}" \\
    https://gateway.canonizr.com/result/$JOB_ID \\
    -H "Authorization: Bearer YOUR_API_KEY")
  CODE=$(echo "$RESULT" | tail -1)
  [ "$CODE" = "200" ] && { echo "$RESULT" | head -1 | jq .markdown; break; }
  [ "$CODE" = "202" ] && sleep 2 || { echo "Error: $RESULT"; break; }
done`,
      },
      {
        language: "python",
        code: `import requests, time

API_KEY = "YOUR_API_KEY"
BASE = "https://gateway.canonizr.com"
HEADERS = {"Authorization": f"Bearer {API_KEY}"}

# Submit
with open("document.pdf", "rb") as f:
    job = requests.post(f"{BASE}/convert", headers=HEADERS, files={"file": f}).json()

# Poll for result
while True:
    resp = requests.get(f"{BASE}{job['poll_url']}", headers=HEADERS)
    if resp.status_code == 200:
        print(resp.json()["markdown"])
        break
    elif resp.status_code == 202:
        time.sleep(2)
    else:
        print(f"Error: {resp.json()}")
        break`,
      },
      {
        language: "javascript",
        code: `const API_KEY = "YOUR_API_KEY";
const BASE = "https://gateway.canonizr.com";

const form = new FormData();
form.append("file", fs.createReadStream("document.pdf"));

// Submit
const { job_id, poll_url } = await fetch(\`\${BASE}/convert\`, {
  method: "POST",
  headers: { "Authorization": \`Bearer \${API_KEY}\` },
  body: form,
}).then(r => r.json());

// Poll for result
while (true) {
  const poll = await fetch(\`\${BASE}\${poll_url}\`, {
    headers: { "Authorization": \`Bearer \${API_KEY}\` },
  });
  if (poll.status === 200) { console.log((await poll.json()).markdown); break; }
  if (poll.status !== 202) throw new Error(await poll.text());
  await new Promise(r => setTimeout(r, 2000));
}`,
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
        code: `import requests, time
from pathlib import Path

API_KEY = "your-very-long-api-key-that-extends-well-beyond-the-visible-area-of-the-code-block-container"
BASE = "https://gateway.canonizr.com"
HEADERS = {"Authorization": f"Bearer {API_KEY}"}

def convert_document(file_path: str, output_dir: str = "./output") -> dict:
    """Convert a single document to markdown with full polling loop."""
    with open(file_path, "rb") as f:
        job = requests.post(f"{BASE}/convert", headers=HEADERS, files={"file": f}).json()
    print(f"Job {job['job_id']} submitted, ~{job['estimated_seconds']}s")
    while True:
        resp = requests.get(f"{BASE}{job['poll_url']}", headers=HEADERS)
        if resp.status_code == 200:
            result = resp.json()
            output_path = Path(output_dir) / f"{Path(file_path).stem}.md"
            output_path.write_text(result["markdown"])
            print(f"Converted {file_path} -> {output_path}")
            return result
        elif resp.status_code == 202:
            time.sleep(2)
        else:
            raise RuntimeError(f"Failed: {resp.status_code} {resp.text}")

for doc in ["report.pdf", "slides.pptx", "manual.docx", "scan.png", "invoice.pdf", "contract.pdf", "whitepaper.pdf"]:
    try:
        convert_document(doc)
    except RuntimeError as e:
        print(f"Failed to convert {doc}: {e}")`,
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
        code: `curl -s -X POST https://gateway.canonizr.com/convert \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -F "file=@document.pdf" | jq .`,
      },
    ],
  },
};
