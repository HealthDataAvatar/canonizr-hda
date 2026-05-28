import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { listSubscriptions } from "@/lib/apim";
import { getRecentRequests } from "@/lib/app-insights";

export async function GET() {
  try {
    const { userId } = await requireUser();
    const keys = await listSubscriptions(userId);
    const subscriptionIds = keys.map((k) => k.id);
    const requests = await getRecentRequests(subscriptionIds);
    return NextResponse.json({ requests });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
