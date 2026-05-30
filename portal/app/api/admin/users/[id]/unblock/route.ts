import { NextResponse } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { updateUser, appendAdminAudit } from "@/lib/data/tables";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin({ autoRedirect: false });
    const { id } = await params;
    await updateUser(id, { blocked: false });
    await appendAdminAudit({
      adminId: admin.userId,
      adminEmail: admin.email,
      targetUserId: id,
      action: "unblock",
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json(null, { status: 404 });
    console.error("POST /api/admin/users/[id]/unblock error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
