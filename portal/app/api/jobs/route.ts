import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { getJobsForUser } from "@/lib/data/jobs";

export async function GET(request: NextRequest) {
  try {
    const { userId } = await requireUser({ autoRedirect: false });
    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const pageSize = Math.min(Number(url.searchParams.get("pageSize") ?? "20"), 100);
    const page = await getJobsForUser(userId, pageSize, cursor);
    return NextResponse.json(page);
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw e;
  }
}
