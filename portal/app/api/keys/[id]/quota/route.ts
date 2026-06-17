import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { getServices } from "@/lib/services";
import { route } from "@/lib/api/route";
import { assertKeyOwned } from "@/lib/api/keys";

export const POST = route(async (request, { params }: { params: Promise<{ id: string }> }) => {
  const { userId } = await requireUser({ autoRedirect: false });
  const { id } = await params;
  await assertKeyOwned(userId, id);

  const { quotaKB } = await request.json();
  if (quotaKB !== null && (typeof quotaKB !== "number" || quotaKB <= 0)) {
    return NextResponse.json({ error: "quotaKB must be a positive number or null" }, { status: 400 });
  }

  const { keys: keyStore } = getServices();
  await keyStore.setQuota(id, quotaKB);
  return NextResponse.json({ ok: true });
}, { label: "POST /api/keys/[id]/quota" });
