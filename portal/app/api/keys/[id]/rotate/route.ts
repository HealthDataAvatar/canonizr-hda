import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { listSubscriptions, rotateKey } from "@/lib/apim";

export async function POST(
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

    const newKey = await rotateKey(id);
    return NextResponse.json({ primaryKey: newKey });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
