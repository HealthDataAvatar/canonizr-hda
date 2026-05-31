import { requireUser } from "@/lib/auth/session";
import { getServices } from "@/lib/services";
import { Playground } from "@/components/playground";

export default async function PlaygroundPage() {
  const { userId } = await requireUser({ autoRedirect: true });
  const { keys: keyStore } = getServices();
  const keys = await keyStore.list(userId);

  const keyOptions = keys.map((k) => ({
    id: k.id,
    displayName: k.displayName,
    key: k.key,
    quotaKB: k.quotaKB,
    usageKB: k.usageKB,
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-[1.5rem] font-semibold">Playground</h1>
      {keys.length === 0 ? (
        <p className="text-[0.9375rem] text-muted-foreground">
          Create an API key first to use the playground.
        </p>
      ) : (
        <Playground keys={keyOptions} />
      )}
    </div>
  );
}
