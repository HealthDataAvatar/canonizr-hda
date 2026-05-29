import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { updateUserRecord } from "@/lib/table-storage";
import { logAdminAction } from "@/lib/audit";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json(null, { status: 404 });
  }

  const { id } = await params;
  const body = await request.json();
  const conn = process.env.TABLE_STORAGE_CONNECTION_STRING!;

  const allowed = ["freeUnits", "maxKeys", "pricePerUnit", "notes"];
  const fields: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) fields[key] = body[key];
  }

  await updateUserRecord(conn, id, fields);
  await logAdminAction(conn, {
    adminId: admin.userId,
    adminEmail: admin.email,
    targetUserId: id,
    action: "update",
    detail: fields,
  });
  return NextResponse.json({ ok: true });
}
