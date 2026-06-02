import Link from "next/link";
import { CreateKeyForm } from "@/components/create-key-form";
import { KeyTable } from "@/components/tables/key-table";
import type { KeyRow } from "@/components/tables/key-table";
import { CodeBlock } from "@/components/ui/code-block";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function CreateFormSkeleton() {
  return (
    <div className="flex gap-2 items-end">
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-10 w-full" />
      </div>
      <Skeleton className="h-10 w-28" />
    </div>
  );
}

function KeyTableSkeleton() {
  return (
    <div className="rounded-md border border-border">
      <table className="w-full table-fixed">
        <thead>
          <tr className="border-b border-border">
            <th className="p-4 text-left"><Skeleton className="h-4 w-12" /></th>
            <th className="p-4 text-left"><Skeleton className="h-4 w-8" /></th>
            <th className="p-4 text-left"><Skeleton className="h-4 w-24" /></th>
          </tr>
        </thead>
        <tbody>
          {[1, 2, 3].map((i) => (
            <tr key={i} className="border-b border-border">
              <td className="p-4"><Skeleton className="h-4 w-28" /></td>
              <td className="p-4"><Skeleton className="h-4 w-36" /></td>
              <td className="p-4"><Skeleton className="h-4 w-40" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function KeysPageContent({ keys }: { keys: KeyRow[] | null }) {
  return (
    <div className="space-y-8">
      <h1 className="">API Keys</h1>

      {keys === null ? <CreateFormSkeleton /> : <CreateKeyForm existingNames={keys.map((k) => k.displayName)} />}

      {keys === null ? <KeyTableSkeleton /> : <KeyTable keys={keys} />}

      {keys !== null && keys.length > 0 && (
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
