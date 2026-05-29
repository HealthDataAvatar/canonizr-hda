import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { updateUserRecord } from "@/lib/table-storage";
import { logAdminAction } from "@/lib/audit";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json(null, { status: 404 });
  }

  const { id } = await params;
  const conn = process.env.TABLE_STORAGE_CONNECTION_STRING!;
  await updateUserRecord(conn, id, { blocked: false });
  await logAdminAction(conn, {
    adminId: admin.userId,
    adminEmail: admin.email,
    targetUserId: id,
    action: "unblock",
  });
  return NextResponse.json({ ok: true });
}
