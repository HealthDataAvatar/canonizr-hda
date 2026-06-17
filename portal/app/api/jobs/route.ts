import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { getJobsForUser } from "@/lib/data/jobs";
import { route } from "@/lib/api/route";

export const GET = route(async (request: Request) => {
  const { userId } = await requireUser({ autoRedirect: false });
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const pageSize = Math.min(Number(url.searchParams.get("pageSize") ?? "20"), 100);
  const page = await getJobsForUser(userId, pageSize, cursor);
  return NextResponse.json(page);
}, { label: "GET /api/jobs" });
