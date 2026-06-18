import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { route } from "@/lib/api/route";
import { getUserApiKey } from "@/lib/api/keys";

const GATEWAY_URL = process.env.GATEWAY_URL ?? "https://api.canonizr.com";

export const GET = route(async (_request, { params }: { params: Promise<{ id: string; name: string }> }) => {
  const { userId } = await requireUser({ autoRedirect: false });
  const { id, name } = await params;

  // Validate artefact name: lowercase alphanumeric + hyphens only
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(name)) {
    return NextResponse.json({ error: "Invalid artefact name" }, { status: 400 });
  }

  const apiKey = await getUserApiKey(userId);
  const res = await fetch(`${GATEWAY_URL}/v1/canonize/${id}/artefacts/${name}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: (await res.json().catch(() => ({}))).detail ?? "Download failed" },
      { status: res.status },
    );
  }

  const data = await res.arrayBuffer();
  const contentType = res.headers.get("content-type") ?? "application/octet-stream";

  // Don't forward Content-Disposition — let the browser's <a download="..."> attribute control the filename
  return new NextResponse(data, {
    headers: { "Content-Type": contentType },
  });
}, { label: "GET /api/jobs/[id]/artefacts/[name]" });
