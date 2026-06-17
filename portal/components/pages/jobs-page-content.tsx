"use client";

import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { CanonizeUserJobTable } from "@/components/tables/canonize-user-job-table";
import type { CanonizeJobRow } from "@/lib/pure/job-types";
import { UploadFormJobContext } from "@/components/upload-form";
import { Button } from "@/components/ui/button";

const REFRESH_INTERVAL = 5_000;

export interface JobsPageContentProps {
  initialRequests: CanonizeJobRow[];
  initialCursor: string | null;
  uploadSlot: ReactNode;
}

export function JobsPageContent({ initialRequests, initialCursor, uploadSlot }: JobsPageContentProps) {
  const [requests, setRequests] = useState(initialRequests);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;

  const hasProcessing = requests.some((r) => r.status === "processing");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs");
      if (!res.ok) return;
      const data = await res.json();
      setRequests(data.jobs);
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

  const handleJobSubmitted = useCallback((_jobId: string) => {
    refresh();
  }, [refresh]);

  const handleDelete = useCallback(async (jobId: string) => {
    const res = await fetch(`/api/jobs/${jobId}`, { method: "DELETE" });
    if (res.ok) {
      setRequests((prev) =>
        prev.map((r) => {
          if (r.id !== jobId) return r;
          const completedAt = "completedAt" in r ? r.completedAt : new Date().toISOString();
          return { ...r, status: "expired" as const, completedAt, expiredAt: new Date().toISOString() };
        })
      );
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!cursorRef.current || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/jobs?cursor=${encodeURIComponent(cursorRef.current)}`);
      if (!res.ok) return;
      const data = await res.json();
      setRequests((prev) => [...prev, ...data.jobs]);
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

      <CanonizeUserJobTable
        jobs={requests}
        artefactUrl={(jobId, name) => `/api/jobs/${jobId}/artefacts/${name}`}
        onDelete={handleDelete}
      />

      {cursor && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
