"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RequestTable, type RequestRow } from "@/components/request-table";

interface UsageData {
  totalUnits: number;
  freeUnits: number | null;
  pricePerUnit: number;
  periodStart: string;
  periodEnd: string;
}

interface RawRequest {
  id: string;
  timestamp: string;
  subscriptionId: string;
  inputSizeBytes: number;
  processingTimeMs: number;
  status: number;
  pipeline: string;
  documentHash: string;
}

const KB_PER_UNIT = 100;

function unitsToDisplay(units: number): string {
  const kb = units * KB_PER_UNIT;
  if (kb >= 1000) return `${(kb / 1000).toFixed(1)} MB`;
  return `${kb} KB`;
}

function formatKB(kb: number): string {
  if (kb >= 1000) return `${(kb / 1000).toFixed(0)} MB`;
  return `${kb} KB`;
}

export default function UsagePage() {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [rows, setRows] = useState<RequestRow[]>([]);

  useEffect(() => {
    fetch("/api/usage")
      .then((r) => r.json())
      .then(setUsage);

    const keysPromise = fetch("/api/keys")
      .then((r) => r.json())
      .then((d) => {
        const map: Record<string, string> = {};
        for (const k of d.keys ?? []) map[k.id] = k.displayName;
        return map;
      });

    fetch("/api/usage/history")
      .then((r) => r.json())
      .then(async (d) => {
        const keyMap = await keysPromise;
        const requests: RawRequest[] = d.requests ?? [];
        setRows(
          requests.map((r) => ({
            id: r.id,
            timestamp: r.timestamp,
            keyName: keyMap[r.subscriptionId] ?? r.subscriptionId,
            inputSizeBytes: r.inputSizeBytes,
            processingTimeMs: r.processingTimeMs,
            pipeline: r.pipeline,
            status: r.status,
            result: { status: "none" as const },
            input: { status: "none" as const },
          }))
        );
      });
  }, []);

  const freeRemainingKB =
    usage && usage.freeUnits !== null
      ? Math.max(0, usage.freeUnits - usage.totalUnits) * KB_PER_UNIT
      : null;
  const freeTotalKB =
    usage?.freeUnits !== null && usage?.freeUnits !== undefined
      ? usage.freeUnits * KB_PER_UNIT
      : null;

  return (
    <div className="space-y-8">
      <h1 className="text-[1.5rem] font-semibold">Usage</h1>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[0.8125rem] font-medium text-muted-foreground">
              Processed this period
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-3xl font-semibold">
              {usage ? unitsToDisplay(usage.totalUnits) : "—"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[0.8125rem] font-medium text-muted-foreground">
              Free tier remaining
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-3xl font-semibold">
              {freeRemainingKB !== null
                ? `${formatKB(freeRemainingKB)} / ${formatKB(freeTotalKB!)}`
                : "Unlimited"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[0.8125rem] font-medium text-muted-foreground">
              Estimated cost
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-3xl font-semibold">
              {usage
                ? `$${(Math.max(0, usage.totalUnits - (usage.freeUnits ?? 0)) * (usage.pricePerUnit ?? 0.003)).toFixed(2)}`
                : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="mb-4 text-[1.125rem] font-semibold">Request history</h2>
        {rows.length === 0 ? (
          <p className="py-8 text-center text-[0.9375rem] text-muted-foreground">
            No requests yet.{" "}
            <Link
              href="/dashboard/keys"
              className="text-accent hover:underline"
            >
              Create an API key
            </Link>{" "}
            to start converting documents.
          </p>
        ) : (
          <RequestTable requests={rows} />
        )}
      </div>
    </div>
  );
}
