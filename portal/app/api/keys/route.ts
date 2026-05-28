import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { listSubscriptions, createSubscription } from "@/lib/apim";
import { getUserRecord } from "@/lib/table-storage";

export async function GET() {
  try {
    const { userId } = await requireUser();
    const keys = await listSubscriptions(userId);
    return NextResponse.json({ keys });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    const { userId } = await requireUser();

    const connectionString = process.env.TABLE_STORAGE_CONNECTION_STRING!;
    const userRecord = await getUserRecord(connectionString, userId);
    const existing = await listSubscriptions(userId);

    if (existing.length >= userRecord.maxKeys) {
      return NextResponse.json(
        { error: `Maximum ${userRecord.maxKeys} keys allowed` },
        { status: 403 }
      );
    }

    const result = await createSubscription(userId, name);
    return NextResponse.json(result, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
