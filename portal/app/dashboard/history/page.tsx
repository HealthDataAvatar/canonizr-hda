import { Suspense } from "react";
import { requireUser } from "@/lib/auth/session";
import { getServices } from "@/lib/services";
import { getHistoryData } from "@/lib/data/user-page-data";
import { JobsPageContent } from "@/components/pages/jobs-page-content";
import { UploadForm, type KeyOption } from "@/components/upload-form";
import { Skeleton } from "@/components/ui/skeleton";

export default async function JobsPage() {
  const { jobs, nextCursor } = await getHistoryData();

  return (
    <JobsPageContent
      initialRequests={jobs}
      initialCursor={nextCursor}
      uploadSlot={
        <UploadForm
          keySelectorSlot={
            <Suspense fallback={<KeySelectorSkeleton />}>
              <KeyResolver />
            </Suspense>
          }
        />
      }
    />
  );
}

function KeySelectorSkeleton() {
  return (
    <div className="space-y-1.5">
      <Skeleton className="h-4 w-14" />
      <Skeleton className="h-10 w-48" />
    </div>
  );
}

async function KeyResolver() {
  const { userId } = await requireUser({ autoRedirect: true });
  const { keys: keyStore } = getServices();
  const keys = await keyStore.list(userId);

  if (keys.length === 0) {
    return (
      <p className="text-muted-foreground">
        Create an API key first to submit jobs.
      </p>
    );
  }

  const { KeySelector } = await import("@/components/upload-form");

  const keyOptions: KeyOption[] = keys.map((k) => ({
    id: k.id,
    displayName: k.displayName,
    key: k.key,
    quotaKB: k.quotaKB,
    usageKB: k.usageKB,
  }));

  return <KeySelector keys={keyOptions} />;
}
