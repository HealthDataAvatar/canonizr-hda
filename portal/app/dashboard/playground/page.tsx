import { Suspense } from "react";
import { requireUser } from "@/lib/auth/session";
import { getServices } from "@/lib/services";
import { Playground } from "@/components/playground";
import type { KeyOption } from "@/components/playground";
import { Skeleton } from "@/components/ui/skeleton";

export default function PlaygroundPage() {
  return (
    <div className="space-y-6">
      <h1>Playground</h1>
      <Playground
        keySelectorSlot={
          <Suspense fallback={<KeySelectorSkeleton />}>
            <KeyResolver />
          </Suspense>
        }
      />
    </div>
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
        Create an API key first to use the playground.
      </p>
    );
  }

  const { KeySelector } = await import("@/components/playground");

  const keyOptions: KeyOption[] = keys.map((k) => ({
    id: k.id,
    displayName: k.displayName,
    key: k.key,
    quotaKB: k.quotaKB,
    usageKB: k.usageKB,
  }));

  return <KeySelector keys={keyOptions} />;
}
