import { NextResponse } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { getCurrentConfig, appendConfig, type UserConfigRecord } from "@/lib/data/tables";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin({ autoRedirect: false });
    const { id } = await params;
    const body = await request.json();

    const current = await getCurrentConfig(id);
    const allowed: (keyof UserConfigRecord)[] = ["freeUnits", "maxKeys", "pricePerUnit", "spendCapKB"];
    const updated = { ...current, changedBy: admin.userId };
    for (const key of allowed) {
      if (key in body) (updated as Record<string, unknown>)[key] = body[key];
    }

    await appendConfig(id, updated);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json(null, { status: 404 });
    console.error("POST /api/admin/users/[id]/update error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
