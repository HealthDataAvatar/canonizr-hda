import { redirect } from "next/navigation";
import { getServices } from "@/lib/services";
import { requireUser } from "@/lib/session";

export default async function DashboardPage() {
  const { userId } = await requireUser();
  const { keys: keyStore } = getServices();
  const keys = await keyStore.list(userId);
  redirect(keys.length > 0 ? "/dashboard/billing" : "/dashboard/keys");
}
