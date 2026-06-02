import { getKeysData } from "@/lib/data/user-page-data";
import { KeysPageContent } from "@/components/pages/keys-page-content";

export default async function KeysPage() {
  const { keys } = await getKeysData();
  return <KeysPageContent keys={keys} />;
}
