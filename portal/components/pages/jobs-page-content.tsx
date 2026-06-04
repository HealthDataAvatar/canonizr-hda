"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { RequestTable } from "@/components/tables/request-table";
import type { RequestRow } from "@/components/tables/request-table";
import { getSessionJobIds, UploadFormJobContext } from "@/components/upload-form";

const REFRESH_INTERVAL = 5_000;

export interface JobsPageContentProps {
  initialRequests: RequestRow[];
  uploadSlot: ReactNode;
}

export function JobsPageContent({ initialRequests, uploadSlot }: JobsPageContentProps) {
  const [requests, setRequests] = useState(initialRequests);
  const [sessionJobIds, setSessionJobIds] = useState<Set<string>>(new Set());

  // Load session job IDs on mount
  useEffect(() => {
    setSessionJobIds(new Set(getSessionJobIds()));
  }, []);

  const hasProcessing = requests.some((r) => r.status === 202);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs");
      if (!res.ok) return;
      const data = await res.json();
      setRequests(data.requests);
    } catch {
      // silently ignore — will retry next interval
    }
  }, []);

  // Auto-refresh when there are processing jobs
  useEffect(() => {
    if (!hasProcessing) return;
    const id = setInterval(refresh, REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [hasProcessing, refresh]);

  const handleJobSubmitted = useCallback((jobId: string) => {
    setSessionJobIds((prev) => new Set([jobId, ...prev]));
    refresh();
  }, [refresh]);

  return (
    <div className="space-y-8">
      <h1>Jobs</h1>

      <UploadFormJobContext.Provider value={handleJobSubmitted}>
        {uploadSlot}
      </UploadFormJobContext.Provider>

      <RequestTable
        requests={requests}
        highlightIds={sessionJobIds}
      />
    </div>
  );
}
