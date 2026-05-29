import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { getUserRecord } from "@/lib/table-storage";
import { getServices } from "@/lib/services";

export async function POST() {
  try {
    const { userId } = await requireUser();
    const connectionString = process.env.TABLE_STORAGE_CONNECTION_STRING!;
    const userRecord = await getUserRecord(connectionString, userId);

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
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
