import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { getServices } from "@/lib/services";
import { getCurrentConfig } from "@/lib/data/tables";
import { validateKeyName } from "@/lib/pure/key-name-validation";
import { route } from "@/lib/api/route";

export const GET = route(async () => {
  const { userId } = await requireUser({ autoRedirect: false });
  const { keys: keyStore } = getServices();
  const keys = await keyStore.list(userId);
  return NextResponse.json({ keys });
}, { label: "GET /api/keys" });

export const POST = route(async (request: Request) => {
  const { userId } = await requireUser({ autoRedirect: false });
  const { keys: keyStore } = getServices();

  const body = await request.json();
  const name = (body.name as string | undefined)?.trim() ?? "";

  const existing = await keyStore.list(userId);
  const nameError = validateKeyName(name, existing.map((k) => k.displayName));
  if (nameError) {
    return NextResponse.json({ error: nameError }, { status: 400 });
  }

  const config = await getCurrentConfig(userId);
  if (existing.length >= config.maxKeys) {
    return NextResponse.json({ error: `Maximum ${config.maxKeys} keys allowed` }, { status: 403 });
  }

  const result = await keyStore.create(userId, name);
  return NextResponse.json(result, { status: 201 });
}, { label: "POST /api/keys" });
