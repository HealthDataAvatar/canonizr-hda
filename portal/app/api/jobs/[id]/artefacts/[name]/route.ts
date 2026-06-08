import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { getServices } from "@/lib/services";

const APIM_URL = process.env.APIM_URL ?? "https://apim-canonizr-prod.azure-api.net";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; name: string }> },
) {
  try {
    await requireUser({ autoRedirect: false });
    const { id, name } = await params;

    // Validate artefact name: lowercase alphanumeric + hyphens only
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(name)) {
      return NextResponse.json({ error: "Invalid artefact name" }, { status: 400 });
    }

    const { keys } = getServices();
    const { userId } = await requireUser({ autoRedirect: false });
    const userKeys = await keys.list(userId);
    if (userKeys.length === 0) {
      return NextResponse.json({ error: "No API key available" }, { status: 400 });
    }
    const apiKey = await keys.get(userKeys[0].id);

    const res = await fetch(`${APIM_URL}/v1/jobs/${id}/artefacts/${name}`, {
      headers: { "Ocp-Apim-Subscription-Key": apiKey },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: (await res.json().catch(() => ({}))).detail ?? "Download failed" },
        { status: res.status },
      );
    }

    const data = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") ?? "application/octet-stream";
    const contentDisposition = res.headers.get("content-disposition") ?? "";

    return new NextResponse(data, {
      headers: {
        "Content-Type": contentType,
        ...(contentDisposition && { "Content-Disposition": contentDisposition }),
      },
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    logger.error({ err }, "GET /api/jobs/[id]/artefacts/[name] error");
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
