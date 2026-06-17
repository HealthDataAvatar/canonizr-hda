import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { route } from "@/lib/api/route";
import { getUserApiKey } from "@/lib/api/keys";

const GATEWAY_URL = process.env.GATEWAY_URL ?? "https://api.canonizr.com";

export const DELETE = route(async (_request, { params }: { params: Promise<{ id: string }> }) => {
  const { userId } = await requireUser({ autoRedirect: false });
  const { id } = await params;
  const apiKey = await getUserApiKey(userId);

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
}, { label: "DELETE /api/jobs/[id]" });
