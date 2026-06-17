"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard error]", error);
  }, [error]);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 space-y-4">
        <div className="space-y-1">
          <p className="text-sm font-mono font-semibold text-destructive uppercase tracking-wider">
            Admin — Server Error
          </p>
          <h1 className="text-[1.25rem] font-semibold">
            Something went wrong
          </h1>
        </div>

        <div className="rounded-md bg-background border border-border p-4 space-y-2 overflow-auto">
          <p className="font-mono text-sm font-semibold">
            {error.name}: {error.message}
          </p>
          {error.digest && (
            <p className="font-mono text-sm text-muted-foreground">
              Digest: {error.digest}
            </p>
          )}
          {process.env.NODE_ENV === "development" && error.stack && (
            <pre className="font-mono text-sm text-muted-foreground whitespace-pre-wrap break-words">
              {error.stack}
            </pre>
          )}
        </div>

        <Button variant="outline" onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  );
}
