import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { getServices } from "@/lib/services";

const GATEWAY_URL = process.env.GATEWAY_URL ?? "https://api.canonizr.com";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await requireUser({ autoRedirect: false });
    const { id } = await params;

    const { keys } = getServices();
    const userKeys = await keys.list(userId);
    if (userKeys.length === 0) {
      return NextResponse.json({ error: "No API key available" }, { status: 400 });
    }
    const apiKey = await keys.get(userKeys[0].id);

    const res = await fetch(`${GATEWAY_URL}/v1/canonize/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: (await res.json().catch(() => ({}))).detail ?? "Delete failed" },
        { status: res.status },
      );
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    logger.error({ err }, "DELETE /api/jobs/[id] error");
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
