"use client";

import { useState, useCallback } from "react";
import { Download, Check, ClipboardCopy } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { toCSV, toMarkdown, downloadBlob } from "@/lib/pure/table-export";
import { ActionGroup } from "./action-group";

export interface TableExportProps {
  headers: string[];
  rows: string[][];
  filenameBase: string;
}

export function TableExport({ headers, rows, filenameBase }: TableExportProps) {
  const [copied, setCopied] = useState(false);

  const handleCSV = useCallback(() => {
    downloadBlob(toCSV(headers, rows), `${filenameBase}.csv`, "text/csv");
  }, [headers, rows, filenameBase]);

  const handleMarkdown = useCallback(() => {
    navigator.clipboard.writeText(toMarkdown(headers, rows));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [headers, rows]);

  return (
    <ActionGroup>
      <IconButton icon={Download} title="Download CSV" onClick={handleCSV} />
      <IconButton
        icon={copied ? Check : ClipboardCopy}
        title={copied ? "Copied" : "Copy as Markdown"}
        tone={copied ? "accent" : "muted"}
        onClick={handleMarkdown}
      />
    </ActionGroup>
  );
}
