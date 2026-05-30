import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { getServices } from "@/lib/services/services";
import { logUserAction } from "@/lib/data/audit";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await requireUser();
    const { id } = await params;
    const { keys: keyStore } = getServices();

    const keys = await keyStore.list(userId);
    if (!keys.some((k) => k.id === id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const primaryKey = await keyStore.get(id);
    return NextResponse.json({ primaryKey });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, email } = await requireUser();
    const { id } = await params;
    const { keys: keyStore } = getServices();

    const keys = await keyStore.list(userId);
    if (!keys.some((k) => k.id === id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await keyStore.delete(id);
    const conn = process.env.TABLE_STORAGE_CONNECTION_STRING!;
    await logUserAction(conn, {
      userId,
      userEmail: email,
      action: "key_delete",
      detail: { keyId: id },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
