import { NextResponse } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { updateUser, appendAdminAudit, type UserUpdateFields } from "@/lib/data/tables";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin({ autoRedirect: false });
    const { id } = await params;
    const body = await request.json();

    const allowed: (keyof UserUpdateFields)[] = ["freeUnits", "maxKeys", "pricePerUnit", "notes"];
    const fields: UserUpdateFields = {};
    for (const key of allowed) {
      if (key in body) (fields as Record<string, unknown>)[key] = body[key];
    }

    await updateUser(id, fields);
    await appendAdminAudit({
      adminId: admin.userId,
      adminEmail: admin.email,
      targetUserId: id,
      action: "update",
      detail: fields as Record<string, unknown>,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json(null, { status: 404 });
    console.error("POST /api/admin/users/[id]/update error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
