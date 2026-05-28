import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { listSubscriptions, deleteSubscription } from "@/lib/apim";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await requireUser();
    const { id } = await params;

    const keys = await listSubscriptions(userId);
    if (!keys.some((k) => k.id === id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await deleteSubscription(id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
