import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { getServices } from "@/lib/services";
import { route } from "@/lib/api/route";
import { assertKeyOwned } from "@/lib/api/keys";

export const GET = route(async (_request, { params }: { params: Promise<{ id: string }> }) => {
  const { userId } = await requireUser({ autoRedirect: false });
  const { id } = await params;
  await assertKeyOwned(userId, id);

  const { keys: keyStore } = getServices();
  const primaryKey = await keyStore.get(id);
  return NextResponse.json({ primaryKey });
}, { label: "GET /api/keys/[id]" });

export const DELETE = route(async (_request, { params }: { params: Promise<{ id: string }> }) => {
  const { userId } = await requireUser({ autoRedirect: false });
  const { id } = await params;
  await assertKeyOwned(userId, id);

  const { keys: keyStore } = getServices();
  await keyStore.delete(id);
  return NextResponse.json({ ok: true });
}, { label: "DELETE /api/keys/[id]" });
