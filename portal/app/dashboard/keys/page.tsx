import { Suspense } from "react";
import { getKeysData } from "@/lib/data/user-page-data";
import { KeysPageContent } from "@/components/pages/keys-page-content";

export default function KeysPage() {
  return (
    <Suspense fallback={<KeysPageContent keys={null} />}>
      <KeysResolver />
    </Suspense>
  );
}

async function KeysResolver() {
  const { keys } = await getKeysData();
  return <KeysPageContent keys={keys} />;
}
