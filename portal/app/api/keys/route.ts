import { NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { getServices } from "@/lib/services/services";
import { getUser, appendUserAudit } from "@/lib/data/tables";

export async function GET() {
  try {
    const { userId } = await requireUser({ autoRedirect: false });
    const { keys: keyStore } = getServices();
    const keys = await keyStore.list(userId);
    return NextResponse.json({ keys });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("GET /api/keys error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const body = await request.json();
  const name = (body.name as string)?.trim();

  if (!name || name.length > 64) {
    return NextResponse.json(
      { error: "Name is required (max 64 characters)" },
      { status: 400 }
    );
  }

  try {
    const { userId } = await requireUser({ autoRedirect: false });
    const { keys: keyStore } = getServices();

    const userRecord = await getUser(userId);
    const existing = await keyStore.list(userId);

    if (existing.length >= userRecord.maxKeys) {
      return NextResponse.json(
        { error: `Maximum ${userRecord.maxKeys} keys allowed` },
        { status: 403 }
      );
    }

    const result = await keyStore.create(userId, name);
    await appendUserAudit({
      userId,
      userEmail: userRecord.email,
      action: "key_create",
      detail: { keyId: result.id, name },
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("POST /api/keys error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
