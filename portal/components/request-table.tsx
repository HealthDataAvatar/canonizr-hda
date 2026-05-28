import { Download, TimerOff, Trash2, Loader } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type BlobState =
  | { status: "available"; url: string }
  | { status: "processing" }
  | { status: "expired" }
  | { status: "none" };

export interface RequestRow {
  id: string;
  timestamp: string;
  keyName: string;
  inputSizeBytes: number;
  processingTimeMs: number;
  pipeline: string;
  status: number;
  result: BlobState;
  input: BlobState;
}

import { timeAgo } from "@/lib/time";

function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1000 * 1000) return `${(bytes / 1000).toFixed(1)} KB`;
  return `${(bytes / (1000 * 1000)).toFixed(1)} MB`;
}

function BlobLink({ blob, label }: { blob: BlobState; label: string }) {
  switch (blob.status) {
    case "available":
      return (
        <a
          href={blob.url}
          target="_blank"
          rel="noopener noreferrer"
          title={`Download ${label}`}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <Download className="size-4" />
        </a>
      );
    case "processing":
      return (
        <span title={`${label} processing`} className="text-muted-foreground/50">
          <Loader className="size-4 animate-spin [animation-duration:6s]" />
        </span>
      );
    case "expired":
      return (
        <span title={`${label} expired`} className="text-muted-foreground/50">
          <TimerOff className="size-4" />
        </span>
      );
    case "none":
      return <span className="text-[0.75rem] text-muted-foreground">—</span>;
  }
}

function isDeletable(row: RequestRow): boolean {
  return row.result.status === "available" || row.input.status === "available";
}

export function RequestTable({
  requests,
  onDelete,
}: {
  requests: RequestRow[];
  onDelete?: (id: string) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Time</TableHead>
          <TableHead>Key</TableHead>
          <TableHead>Size</TableHead>
          <TableHead>Duration</TableHead>
          <TableHead>Pipeline</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Result</TableHead>
          <TableHead>Original</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {requests.map((r) => (
          <TableRow
            key={r.id}
            id={r.id}
            className="scroll-mt-24 target:bg-accent-subtle"
          >
            <TableCell>
              <div className="flex flex-col">
                <span className="font-mono text-[0.875rem]">
                  {new Date(r.timestamp).toLocaleString()}
                </span>
                <span className="text-[0.75rem] text-muted-foreground">
                  {timeAgo(r.timestamp)}
                </span>
              </div>
            </TableCell>
            <TableCell className="font-mono text-[0.8125rem] text-muted-foreground">
              {r.keyName}
            </TableCell>
            <TableCell className="font-mono text-[0.875rem]">
              {formatBytes(r.inputSizeBytes)}
            </TableCell>
            <TableCell className="font-mono text-[0.875rem]">
              {(r.processingTimeMs / 1000).toFixed(1)}s
            </TableCell>
            <TableCell className="text-[0.875rem]">{r.pipeline}</TableCell>
            <TableCell>
              <Badge variant={r.status === 200 ? "default" : "destructive"}>
                {r.status}
              </Badge>
            </TableCell>
            <TableCell>
              <BlobLink blob={r.result} label="result" />
            </TableCell>
            <TableCell>
              <BlobLink blob={r.input} label="original" />
            </TableCell>
            <TableCell>
              {isDeletable(r) && onDelete && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("Delete all stored data for this request? This cannot be undone.")) {
                      onDelete(r.id);
                    }
                  }}
                  title="Delete stored data"
                  className="text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
