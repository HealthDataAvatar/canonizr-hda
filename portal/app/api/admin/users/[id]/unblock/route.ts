import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { setUserBlocked } from "@/lib/data/tables";
import { route } from "@/lib/api/route";

export const POST = route(async (_request, { params }: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin({ autoRedirect: false });
  const { id } = await params;
  await setUserBlocked(id, false, admin.userId);
  return NextResponse.json({ ok: true });
}, { authStatus: 404, label: "POST /api/admin/users/[id]/unblock" });
