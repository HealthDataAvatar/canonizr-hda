import Link from "next/link";
import { CreateKeyForm } from "@/components/create-key-form";
import { KeyTable } from "@/components/tables/key-table";
import type { KeyRow } from "@/components/tables/key-table";
import { CodeBlock } from "@/components/ui/code-block";
import { Card, CardContent } from "@/components/ui/card";

export function KeysPageContent({ keys }: { keys: KeyRow[] }) {
  return (
    <div className="space-y-8">
      <h1 className="">API Keys</h1>

      <CreateKeyForm existingNames={keys.map((k) => k.displayName)} />

      <KeyTable keys={keys} />

      {keys.length > 0 && (
        <Card>
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="font-medium">Try it out</p>
              <p className="">
                Upload a document and see the conversion in real time.
              </p>
            </div>
            <Link
              href="/dashboard/playground"
              className="shrink-0 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent/90 transition-colors"
            >
              Open Playground
            </Link>
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="mb-4">Quick start</h2>
        <CodeBlock
          highlight={["YOUR_API_KEY"]}
          samples={[
            {
              language: "bash",
              code: `# Submit a document
POLL_URL=$(curl -s -X POST https://apim-canonizr-prod.azure-api.net/v1/jobs \\
  -H "Ocp-Apim-Subscription-Key: YOUR_API_KEY" \\
  -F "file=@document.pdf" | jq -r .poll_url)

# Fetch the result
curl -s https://apim-canonizr-prod.azure-api.net$POLL_URL \\
  -H "Ocp-Apim-Subscription-Key: YOUR_API_KEY" | jq .markdown`,
            },
            {
              language: "python",
              code: `import requests

API_KEY = "YOUR_API_KEY"
BASE = "https://apim-canonizr-prod.azure-api.net"
HEADERS = {"Ocp-Apim-Subscription-Key": API_KEY}

# Submit a document
with open("document.pdf", "rb") as f:
    job = requests.post(f"{BASE}/v1/jobs", headers=HEADERS, files={"file": f}).json()

# Fetch the result
resp = requests.get(f"{BASE}{job['poll_url']}", headers=HEADERS)
print(resp.json()["markdown"])`,
            },
            {
              language: "javascript",
              code: `const API_KEY = "YOUR_API_KEY";
const BASE = "https://apim-canonizr-prod.azure-api.net";

// Submit a document
const form = new FormData();
form.append("file", fs.createReadStream("document.pdf"));

const { poll_url } = await fetch(\`\${BASE}/v1/jobs\`, {
  method: "POST",
  headers: { "Ocp-Apim-Subscription-Key": API_KEY },
  body: form,
}).then(r => r.json());

// Fetch the result
const result = await fetch(\`\${BASE}\${poll_url}\`, {
  headers: { "Ocp-Apim-Subscription-Key": API_KEY },
}).then(r => r.json());
console.log(result.markdown);`,
            },
          ]}
        />
      </div>
    </div>
  );
}
