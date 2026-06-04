import { NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { getJobsForUser } from "@/lib/data/jobs";

export async function GET() {
  try {
    const { userId } = await requireUser({ autoRedirect: false });
    const requests = await getJobsForUser(userId);
    return NextResponse.json({ requests });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw e;
  }
}
