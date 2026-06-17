import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { getServices } from "@/lib/services";
import { route } from "@/lib/api/route";
import { assertKeyOwned } from "@/lib/api/keys";

export const POST = route(async (_request, { params }: { params: Promise<{ id: string }> }) => {
  const { userId } = await requireUser({ autoRedirect: false });
  const { id } = await params;
  await assertKeyOwned(userId, id);

  const { keys: keyStore } = getServices();
  const newKey = await keyStore.rotate(id);
  return NextResponse.json({ primaryKey: newKey });
}, { label: "POST /api/keys/[id]/rotate" });
