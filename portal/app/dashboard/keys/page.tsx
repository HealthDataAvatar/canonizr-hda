import { Suspense } from "react";
import { getKeysData } from "@/lib/data/user-page-data";
import { KeysPageContent, KeysLoadingSlots } from "@/components/pages/keys-page-content";

export default function KeysPage() {
  return (
    <KeysPageContent
      dataSlot={
        <Suspense fallback={<KeysLoadingSlots />}>
          <KeysResolver />
        </Suspense>
      }
    />
  );
}

async function KeysResolver() {
  const { keys } = await getKeysData();

  const { KeysDataSlots } = await import("@/components/pages/keys-page-content");
  return <KeysDataSlots keys={keys} />;
}
