import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { getUserRecord } from "@/lib/table-storage";
import { getUsage } from "@/lib/stripe";

export async function GET() {
  try {
    const { userId } = await requireUser();
    const connectionString = process.env.TABLE_STORAGE_CONNECTION_STRING!;
    const userRecord = await getUserRecord(connectionString, userId);

    if (!userRecord.stripeCustomerId) {
      return NextResponse.json({
        totalUnits: 0,
        freeUnits: userRecord.freeUnits,
        periodStart: "",
        periodEnd: "",
      });
    }

    const usage = await getUsage(userRecord.stripeCustomerId);
    return NextResponse.json({
      ...usage,
      freeUnits: userRecord.freeUnits,
      pricePerUnit: userRecord.pricePerUnit,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
