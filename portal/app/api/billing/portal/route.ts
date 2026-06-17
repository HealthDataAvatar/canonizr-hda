import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { getCurrentPermissions } from "@/lib/data/tables";
import { getServices } from "@/lib/services";
import { route } from "@/lib/api/route";

export const POST = route(async () => {
  const { userId } = await requireUser({ autoRedirect: false });
  const userRecord = await getCurrentPermissions(userId);

  if (!userRecord.stripeCustomerId) {
    return NextResponse.json({ error: "No billing account" }, { status: 400 });
  }

  const { billing } = getServices();
  const returnUrl = `${process.env.AUTH_URL ?? "http://localhost:3000"}/dashboard/billing`;
  const url = await billing.createBillingPortalSession(userRecord.stripeCustomerId, returnUrl);
  return NextResponse.json({ url });
}, { label: "POST /api/billing/portal" });
