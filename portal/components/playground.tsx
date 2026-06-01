"use client";

import { useState, useRef, useCallback } from "react";
import Markdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CopyButton } from "@/components/ui/copy-button";
import { tabVariants } from "@/components/ui/code-block";
import { UsageBar } from "@/components/usage-bar";
import { Upload, Loader, FileText } from "lucide-react";
import { formatKB } from "@/lib/pure/format";

const APIM_URL = "https://apim-canonizr-prod.azure-api.net";
const POLL_INTERVAL = 1500;

interface KeyOption {
  id: string;
  displayName: string;
  key: string;
  quotaKB: number | null;
  usageKB: number;
}

type Status = "idle" | "uploading" | "processing" | "done" | "error";

export function Playground({ keys }: { keys: KeyOption[] }) {
  const [selectedKeyId, setSelectedKeyId] = useState(keys[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [markdown, setMarkdown] = useState("");
  const [error, setError] = useState("");
  const [jobInfo, setJobInfo] = useState<{ inputBytes: number; timeMs: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [resultTab, setResultTab] = useState<"rendered" | "plain">("rendered");

  const selectedKey = keys.find((k) => k.id === selectedKeyId);
  const apiKey = selectedKey?.key ?? "";

  const handleFile = useCallback((f: File) => {
    setFile(f);
    setStatus("idle");
    setMarkdown("");
    setError("");
    setJobInfo(null);
  }, []);

  async function handleSubmit() {
    if (!file || !apiKey) return;

    setStatus("uploading");
    setError("");
    setMarkdown("");
    setJobInfo(null);

    const startTime = Date.now();

    try {
      // Submit
      const form = new FormData();
      form.append("file", file);

      const submitRes = await fetch(`${APIM_URL}/v1/jobs`, {
        method: "POST",
        headers: { "Ocp-Apim-Subscription-Key": apiKey },
        body: form,
      });

      if (!submitRes.ok) {
        const body = await submitRes.json().catch(() => ({}));
        throw new Error(body.detail ?? `Submit failed: ${submitRes.status}`);
      }

      const { poll_url, input_bytes } = await submitRes.json();
      setStatus("processing");

      // Poll
      while (true) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL));

        const pollRes = await fetch(`${APIM_URL}${poll_url}`, {
          headers: { "Ocp-Apim-Subscription-Key": apiKey },
        });

        if (pollRes.status === 202) continue;

        if (!pollRes.ok) {
          const body = await pollRes.json().catch(() => ({}));
          throw new Error(body.detail ?? `Processing failed: ${pollRes.status}`);
        }

        const result = await pollRes.json();
        setMarkdown(result.markdown ?? "");
        setJobInfo({
          inputBytes: input_bytes,
          timeMs: Date.now() - startTime,
        });
        setStatus("done");
        return;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStatus("error");
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  return (
    <div className="space-y-6">
      {/* Key selector */}
      <div className="space-y-1.5">
        <Label htmlFor="key-select">API Key</Label>
        <div className="flex items-center gap-4">
          <select
            id="key-select"
            value={selectedKeyId}
            onChange={(e) => setSelectedKeyId(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {keys.map((k) => (
              <option key={k.id} value={k.id}>{k.displayName}</option>
            ))}
          </select>
          {selectedKey && (
            <UsageBar usageKB={selectedKey.usageKB} quotaKB={selectedKey.quotaKB} />
          )}
        </div>
      </div>

      {/* Drop zone */}
      <div
        ref={dropRef}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-12 cursor-pointer transition-colors ${
          dragOver ? "border-accent bg-accent/5" : "border-border hover:border-muted-foreground/50"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        {file ? (
          <>
            <FileText className="size-8 text-muted-foreground" />
            <p className="font-medium">{file.name}</p>
            <p className="text-sm text-muted-foreground">{formatKB(Math.ceil(file.size / 1024))}</p>
          </>
        ) : (
          <>
            <Upload className="size-8 text-muted-foreground" />
            <p className="text-muted-foreground">
              Drop a file here or click to select
            </p>
          </>
        )}
      </div>

      {/* Submit */}
      <Button
        onClick={handleSubmit}
        disabled={!file || status === "uploading" || status === "processing"}
        className="w-full"
      >
        {status === "uploading" && <><Loader className="size-4 mr-2 animate-spin" /> Uploading…</>}
        {status === "processing" && <><Loader className="size-4 mr-2 animate-spin" /> Processing…</>}
        {(status === "idle" || status === "done" || status === "error") && "Convert"}
      </Button>

      {/* Error */}
      {status === "error" && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {/* Result */}
      {status === "done" && (
        <div className="space-y-3">
          {jobInfo && (
            <p className="text-sm text-muted-foreground">
              {formatKB(Math.ceil(jobInfo.inputBytes / 1024))} processed in {(jobInfo.timeMs / 1000).toFixed(1)}s
            </p>
          )}
          <div className="flex items-center justify-between border-b border-border">
            <div className="flex">
              <button
                type="button"
                onClick={() => setResultTab("rendered")}
                className={tabVariants({ active: resultTab === "rendered" })}
              >
                Rendered
              </button>
              <button
                type="button"
                onClick={() => setResultTab("plain")}
                className={tabVariants({ active: resultTab === "plain" })}
              >
                Markdown
              </button>
            </div>
            <CopyButton value={markdown} />
          </div>
          {resultTab === "rendered" ? (
            <div className="prose prose-sm dark:prose-invert max-h-[600px] overflow-auto rounded-lg border border-border bg-card p-4">
              <Markdown>{markdown}</Markdown>
            </div>
          ) : (
            <pre className="max-h-[600px] overflow-auto rounded-lg border border-border bg-card p-4 text-sm whitespace-pre-wrap">
              {markdown}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
