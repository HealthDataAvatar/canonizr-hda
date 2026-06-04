"use client";

import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { RequestTable } from "@/components/tables/request-table";
import type { RequestRow } from "@/components/tables/request-table";
import { getSessionJobIds, UploadFormJobContext } from "@/components/upload-form";

const REFRESH_INTERVAL = 5_000;

export interface JobsPageContentProps {
  initialRequests: RequestRow[];
  initialCursor: string | null;
  uploadSlot: ReactNode;
}

export function JobsPageContent({ initialRequests, initialCursor, uploadSlot }: JobsPageContentProps) {
  const [requests, setRequests] = useState(initialRequests);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sessionJobIds, setSessionJobIds] = useState<Set<string>>(new Set());
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;

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
      setCursor(data.nextCursor);
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

  const loadMore = useCallback(async () => {
    if (!cursorRef.current || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/jobs?cursor=${encodeURIComponent(cursorRef.current)}`);
      if (!res.ok) return;
      const data = await res.json();
      setRequests((prev) => [...prev, ...data.requests]);
      setCursor(data.nextCursor);
    } catch {
      // silently ignore
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore]);

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

      {cursor && (
        <div className="flex justify-center">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
