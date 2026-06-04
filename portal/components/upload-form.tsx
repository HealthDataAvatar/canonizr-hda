"use client";

import { useState, useRef, useCallback, createContext, useContext, useEffect, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { UsageBar } from "@/components/usage-bar";
import { Upload, Loader, FileText } from "lucide-react";
import { formatKB } from "@/lib/pure/format";

const APIM_URL = "https://apim-canonizr-prod.azure-api.net";

export interface KeyOption {
  id: string;
  displayName: string;
  key: string;
  quotaKB: number | null;
  usageKB: number;
}

const KeyContext = createContext<{
  onKeyChange: (key: string) => void;
} | null>(null);

export function KeySelector({ keys }: { keys: KeyOption[] }) {
  const ctx = useContext(KeyContext);
  const [selectedKeyId, setSelectedKeyId] = useState(keys[0]?.id ?? "");
  const selectedKey = keys.find((k) => k.id === selectedKeyId);

  useEffect(() => {
    ctx?.onKeyChange(selectedKey?.key ?? "");
  }, [ctx, selectedKey]);

  return (
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
  );
}

const SESSION_JOBS_KEY = "canonizr_session_jobs";

/** Get job IDs submitted in this browser session */
export function getSessionJobIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_JOBS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function addSessionJobId(jobId: string) {
  const ids = getSessionJobIds();
  ids.unshift(jobId);
  sessionStorage.setItem(SESSION_JOBS_KEY, JSON.stringify(ids.slice(0, 100)));
}

/** Context for the parent JobsPageContent to receive job submission events */
export const UploadFormJobContext = createContext<((jobId: string) => void) | null>(null);

type SubmitStatus = "idle" | "uploading" | "submitting";

export interface UploadFormProps {
  keySelectorSlot: ReactNode;
}

export function UploadForm({ keySelectorSlot }: UploadFormProps) {
  const onJobSubmitted = useContext(UploadFormJobContext);
  const [apiKey, setApiKey] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleKeyChange = useCallback((key: string) => setApiKey(key), []);

  const handleFile = useCallback((f: File) => {
    setFile(f);
    setError("");
  }, []);

  async function handleSubmit() {
    if (!file || !apiKey) return;

    setStatus("uploading");
    setError("");

    try {
      const form = new FormData();
      form.append("file", file);

      setStatus("submitting");
      const submitRes = await fetch(`${APIM_URL}/v1/jobs`, {
        method: "POST",
        headers: { "Ocp-Apim-Subscription-Key": apiKey },
        body: form,
      });

      if (!submitRes.ok) {
        const body = await submitRes.json().catch(() => ({}));
        throw new Error(body.detail ?? `Submit failed: ${submitRes.status}`);
      }

      const { job_id } = await submitRes.json();
      addSessionJobId(job_id);
      setFile(null);
      setStatus("idle");
      onJobSubmitted?.(job_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStatus("idle");
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  const busy = status !== "idle";

  return (
    <KeyContext.Provider value={{ onKeyChange: handleKeyChange }}>
      <div className="space-y-4">
        {keySelectorSlot}

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 cursor-pointer transition-colors ${
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
              <FileText className="size-6 text-muted-foreground" />
              <p className="font-medium text-sm">{file.name}</p>
              <p className="text-xs text-muted-foreground">{formatKB(Math.ceil(file.size / 1024))}</p>
            </>
          ) : (
            <>
              <Upload className="size-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Drop a file here or click to select
              </p>
            </>
          )}
        </div>

        <Button
          onClick={handleSubmit}
          disabled={!file || !apiKey || busy}
          className="w-full"
        >
          {busy && <Loader className="size-4 mr-2 animate-spin" />}
          {busy ? "Submitting…" : "Convert"}
        </Button>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
      </div>
    </KeyContext.Provider>
  );
}
