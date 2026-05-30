import { NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { getUser } from "@/lib/data/tables";
import { getServices } from "@/lib/services";

export async function POST() {
  try {
    const { userId } = await requireUser({ autoRedirect: false });
    const userRecord = await getUser(userId);

    if (!userRecord.stripeCustomerId) {
      return NextResponse.json(
        { error: "No billing account" },
        { status: 400 }
      );
    }

    const { billing } = getServices();
    const returnUrl = `${process.env.AUTH_URL ?? "http://localhost:3000"}/dashboard/billing`;
    const url = await billing.createBillingPortalSession(
      userRecord.stripeCustomerId,
      returnUrl,
    );
    return NextResponse.json({ url });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("POST /api/billing/portal error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
