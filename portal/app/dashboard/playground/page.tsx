import { Suspense } from "react";
import { requireUser } from "@/lib/auth/session";
import { getServices } from "@/lib/services";
import { Playground } from "@/components/playground";
import { PlaygroundSkeleton } from "@/components/playground-skeleton";

export default function PlaygroundPage() {
  return (
    <div className="space-y-6">
      <h1>Playground</h1>
      <Suspense fallback={<PlaygroundSkeleton />}>
        <PlaygroundResolver />
      </Suspense>
    </div>
  );
}

async function PlaygroundResolver() {
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

  const keyOptions = keys.map((k) => ({
    id: k.id,
    displayName: k.displayName,
    key: k.key,
    quotaKB: k.quotaKB,
    usageKB: k.usageKB,
  }));

  return <Playground keys={keyOptions} />;
}
