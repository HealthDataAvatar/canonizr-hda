"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CopyButton } from "@/components/ui/copy-button";
import { CodeBlock } from "@/components/ui/code-block";
import { KeyTable, type KeyRow } from "@/components/key-table";
import { generateKeyName } from "@/lib/key-names";

export default function KeysPage() {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [newKeyName, setNewKeyName] = useState(generateKeyName);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [rotatedKey, setRotatedKey] = useState<{
    id: string;
    key: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const loadKeys = useCallback(() => {
    fetch("/api/keys")
      .then((r) => r.json())
      .then((d) => setKeys(d.keys ?? []));
  }, []);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  async function handleCreate() {
    if (!newKeyName.trim()) return;
    setLoading(true);
    const res = await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newKeyName.trim() }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) {
      setCreatedKey(data.primaryKey);
      setNewKeyName(generateKeyName());
      loadKeys();
    }
  }

  function handleDelete(id: string) {
    if (
      !confirm(
        "Delete this API key? This action is immediate and cannot be undone."
      )
    )
      return;
    fetch(`/api/keys/${id}`, { method: "DELETE" }).then(loadKeys);
  }

  async function handleRotate(id: string) {
    if (
      !confirm("Rotate this key? The old key will stop working immediately.")
    )
      return;
    const res = await fetch(`/api/keys/${id}/rotate`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setRotatedKey({ id, key: data.primaryKey });
    }
  }

  const bashExample = (key: string) =>
    `# Submit
JOB_ID=$(curl -s -X POST https://api.canonizr.com/convert \\
  -H "Ocp-Apim-Subscription-Key: ${key}" \\
  -F "file=@document.pdf" | jq -r .job_id)

# Poll for result
while true; do
  RESULT=$(curl -s -w "\\n%{http_code}" \\
    https://api.canonizr.com/result/$JOB_ID \\
    -H "Ocp-Apim-Subscription-Key: ${key}")
  CODE=$(echo "$RESULT" | tail -1)
  [ "$CODE" = "200" ] && { echo "$RESULT" | head -1 | jq .markdown; break; }
  [ "$CODE" = "202" ] && sleep 2 || { echo "Error: $RESULT"; break; }
done`;

  const pythonExample = (key: string) =>
    `import requests, time

API_KEY = "${key}"
BASE = "https://api.canonizr.com"
HEADERS = {"Ocp-Apim-Subscription-Key": API_KEY}

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
        break`;

  const jsExample = (key: string) =>
    `const API_KEY = "${key}";
const BASE = "https://api.canonizr.com";

const form = new FormData();
form.append("file", fs.createReadStream("document.pdf"));

// Submit
const { job_id, poll_url } = await fetch(\`\${BASE}/convert\`, {
  method: "POST",
  headers: { "Ocp-Apim-Subscription-Key": API_KEY },
  body: form,
}).then(r => r.json());

// Poll for result
while (true) {
  const poll = await fetch(\`\${BASE}\${poll_url}\`, {
    headers: { "Ocp-Apim-Subscription-Key": API_KEY },
  });
  if (poll.status === 200) { console.log((await poll.json()).markdown); break; }
  if (poll.status !== 202) throw new Error(await poll.text());
  await new Promise(r => setTimeout(r, 2000));
}`;

  return (
    <div className="space-y-8">
      <h1 className="text-[1.5rem] font-semibold">API Keys</h1>

      {/* Create form */}
      <div className="flex gap-3">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="key-name">Key name</Label>
          <Input
            ref={nameInputRef}
            id="key-name"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            onFocus={() => nameInputRef.current?.select()}
            maxLength={64}
          />
        </div>
        <div className="flex items-end">
          <Button
            onClick={handleCreate}
            disabled={loading || !newKeyName.trim()}
          >
            {loading ? "Creating…" : "Create key"}
          </Button>
        </div>
      </div>

      {/* Key just created */}
      {createdKey && (
        <div className="space-y-4 rounded-lg border border-border p-5">
          <div className="space-y-2">
            <p className="text-[0.9375rem] font-semibold">Key created</p>
            <p className="text-[0.8125rem] text-muted-foreground">
              Copy this key now — it won&apos;t be shown again.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-md bg-surface px-4 py-3">
            <code className="flex-1 break-all font-mono text-[0.875rem]">
              {createdKey}
            </code>
            <CopyButton value={createdKey} />
          </div>
          <CodeBlock
            highlight={[createdKey]}
            samples={[
              { language: "bash", code: bashExample(createdKey) },
              { language: "python", code: pythonExample(createdKey) },
              { language: "javascript", code: jsExample(createdKey) },
            ]}
          />
          <Button variant="ghost" size="sm" onClick={() => setCreatedKey(null)}>
            Dismiss
          </Button>
        </div>
      )}

      {/* Rotated key */}
      {rotatedKey && (
        <div className="space-y-3 rounded-lg border border-border p-5">
          <p className="text-[0.9375rem] font-semibold">
            New key for &quot;
            {keys.find((k) => k.id === rotatedKey.id)?.displayName}&quot;
          </p>
          <p className="text-[0.8125rem] text-muted-foreground">
            Copy this key now — it won&apos;t be shown again.
          </p>
          <div className="flex items-center gap-2 rounded-md bg-surface px-4 py-3">
            <code className="flex-1 break-all font-mono text-[0.875rem]">
              {rotatedKey.key}
            </code>
            <CopyButton value={rotatedKey.key} />
          </div>
          <Button variant="ghost" size="sm" onClick={() => setRotatedKey(null)}>
            Dismiss
          </Button>
        </div>
      )}

      {/* Keys table */}
      <KeyTable keys={keys} onRotate={handleRotate} onDelete={handleDelete} />
    </div>
  );
}
