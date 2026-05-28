"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface UsageData {
  totalUnits: number;
  freeUnits: number | null;
  pricePerUnit: number;
  periodStart: string;
  periodEnd: string;
}

interface RequestRecord {
  timestamp: string;
  subscriptionId: string;
  inputSizeBytes: number;
  processingTimeMs: number;
  status: number;
  pipeline: string;
  documentHash: string;
}

export default function DashboardPage() {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [requests, setRequests] = useState<RequestRecord[]>([]);

  useEffect(() => {
    fetch("/api/usage").then((r) => r.json()).then(setUsage);
    fetch("/api/usage/history").then((r) => r.json()).then((d) => setRequests(d.requests ?? []));
  }, []);

  const freeRemaining =
    usage && usage.freeUnits !== null
      ? Math.max(0, usage.freeUnits - usage.totalUnits)
      : null;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Units this period
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {usage?.totalUnits ?? "—"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Free tier remaining
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {freeRemaining !== null
                ? `${freeRemaining} / ${usage?.freeUnits}`
                : "Unlimited"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Estimated cost
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {usage
                ? `$${(Math.max(0, usage.totalUnits - (usage.freeUnits ?? 0)) * (usage.pricePerUnit ?? 0.003)).toFixed(2)}`
                : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="mb-4 text-lg font-semibold">Recent requests</h2>
        {requests.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No requests yet. Use your API key to make your first conversion.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Pipeline</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm">
                      {new Date(r.timestamp).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatBytes(r.inputSizeBytes)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.processingTimeMs}ms
                    </TableCell>
                    <TableCell className="text-sm">{r.pipeline}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === 200 ? "default" : "destructive"}>
                        {r.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
