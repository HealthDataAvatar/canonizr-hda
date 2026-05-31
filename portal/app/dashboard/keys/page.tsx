import { getKeysData } from "@/lib/data/user-page-data";
import { CreateKeyForm } from "@/components/create-key-form";
import { KeyTable } from "@/components/key-table";
import { CodeBlock } from "@/components/ui/code-block";

export default async function KeysPage() {
  const { keys } = await getKeysData();

  return (
    <div className="space-y-8">
      <h1 className="text-[1.5rem] font-semibold">API Keys</h1>

      <CreateKeyForm existingNames={keys.map((k) => k.displayName)} />

      <KeyTable keys={keys} />

      <div>
        <h2 className="mb-4 text-[1.125rem] font-semibold">Quick start</h2>
        <CodeBlock
          highlight={["YOUR_API_KEY"]}
          samples={[
            {
              language: "bash",
              code: `# Submit a document
POLL_URL=$(curl -s -X POST https://api.canonizr.com/v1/jobs \\
  -H "Ocp-Apim-Subscription-Key: YOUR_API_KEY" \\
  -F "file=@document.pdf" | jq -r .poll_url)

# Fetch the result
curl -s https://api.canonizr.com$POLL_URL \\
  -H "Ocp-Apim-Subscription-Key: YOUR_API_KEY" | jq .markdown`,
            },
            {
              language: "python",
              code: `import requests

API_KEY = "YOUR_API_KEY"
BASE = "https://api.canonizr.com"
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
const BASE = "https://api.canonizr.com";

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
