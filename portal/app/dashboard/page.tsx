"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ErrorBanner } from "@/components/error-banner";

interface RequestRecord {
  timestamp: string;
  subscriptionId: string;
  inputSizeBytes: number;
  processingTimeMs: number;
  status: number;
  pipeline: string;
  documentHash: string;
}

interface KeyInfo {
  id: string;
  displayName: string;
}

export default function DashboardPage() {
  const [recentError, setRecentError] = useState<{
    id: string;
    keyName: string;
    status: number;
    timestamp: string;
  } | null>(null);
  const [hasKeys, setHasKeys] = useState<boolean | null>(null);

  useEffect(() => {
    const keysPromise = fetch("/api/keys")
      .then((r) => r.json())
      .then((d) => {
        const keys: KeyInfo[] = d.keys ?? [];
        setHasKeys(keys.length > 0);
        return keys;
      });

    fetch("/api/usage/history")
      .then((r) => r.json())
      .then(async (d) => {
        const requests: RequestRecord[] = d.requests ?? [];
        const fiveMinAgo = Date.now() - 5 * 60 * 1000;
        const error = requests.find(
          (r) =>
            r.status !== 200 && new Date(r.timestamp).getTime() > fiveMinAgo
        );
        if (error) {
          const keys = await keysPromise;
          const keyName =
            keys.find((k) => k.id === error.subscriptionId)?.displayName ??
            error.subscriptionId;
          setRecentError({
            id: error.id,
            keyName,
            status: error.status,
            timestamp: error.timestamp,
          });
        }
      });
  }, []);

  return (
    <div className="space-y-8">
      <h1 className="text-[1.5rem] font-semibold">Dashboard</h1>

      {recentError && <ErrorBanner error={recentError} />}

      <div className="grid gap-6 sm:grid-cols-2">
        <Link
          href="/dashboard/keys"
          className="rounded-lg border border-border p-6 transition-colors hover:border-foreground/20"
        >
          <h2 className="text-[1.125rem] font-semibold">API Keys</h2>
          <p className="mt-1 text-[0.8125rem] text-muted-foreground">
            Create, rotate, and manage your API keys.
          </p>
        </Link>
        <Link
          href="/dashboard/usage"
          className="rounded-lg border border-border p-6 transition-colors hover:border-foreground/20"
        >
          <h2 className="text-[1.125rem] font-semibold">Usage</h2>
          <p className="mt-1 text-[0.8125rem] text-muted-foreground">
            View processed data, costs, and request history.
          </p>
        </Link>
      </div>

      {hasKeys === false && (
        <p className="text-center text-[0.9375rem] text-muted-foreground">
          Get started by{" "}
          <Link
            href="/dashboard/keys"
            className="text-accent hover:underline"
          >
            creating an API key
          </Link>
          .
        </p>
      )}
    </div>
  );
}
