import { NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { getServices } from "@/lib/services";
import { appendUserAudit } from "@/lib/data/tables";

export async function GET(
  _request: Request,
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

    const primaryKey = await keyStore.get(id);
    return NextResponse.json({ primaryKey });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("GET /api/keys/[id] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, email } = await requireUser({ autoRedirect: false });
    const { id } = await params;
    const { keys: keyStore } = getServices();

    const keys = await keyStore.list(userId);
    if (!keys.some((k) => k.id === id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await keyStore.delete(id);
    await appendUserAudit({
      userId,
      userEmail: email,
      action: "key_delete",
      detail: { keyId: id },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("DELETE /api/keys/[id] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
