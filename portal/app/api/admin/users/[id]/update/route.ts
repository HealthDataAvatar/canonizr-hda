import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { getCurrentConfig, appendConfig, type UserConfigRecord } from "@/lib/data/tables";
import { route } from "@/lib/api/route";

export const POST = route(async (request, { params }: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin({ autoRedirect: false });
  const { id } = await params;
  const body = await request.json();

  const current = await getCurrentConfig(id);
  const allowed: (keyof UserConfigRecord)[] = ["freeUnits", "maxKeys", "spendCapUnits", "adminCapUnits", "paidEnabled", "comp"];
  const updated = { ...current, changedBy: admin.userId };
  for (const key of allowed) {
    if (key in body) (updated as Record<string, unknown>)[key] = body[key];
  }

  await appendConfig(id, updated);
  return NextResponse.json({ ok: true });
}, { authStatus: 404, label: "POST /api/admin/users/[id]/update" });
