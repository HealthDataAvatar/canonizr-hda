import { NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { getServices } from "@/lib/services";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await requireUser({ autoRedirect: false });
    const { id } = await params;
    const { keys: keyStore } = getServices();

    const keys = await keyStore.list(userId);
    if (!keys.some((k) => k.id === id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();
    const { quotaKB } = body;
    if (quotaKB !== null && (typeof quotaKB !== "number" || quotaKB <= 0)) {
      return NextResponse.json({ error: "quotaKB must be a positive number or null" }, { status: 400 });
    }

    await keyStore.setQuota(id, quotaKB);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("POST /api/keys/[id]/quota error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
