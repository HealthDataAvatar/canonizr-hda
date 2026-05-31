import { NextResponse } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { getServices } from "@/lib/services";
import { sumInvoiceAmounts } from "@/lib/pure/admin-calc";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin({ autoRedirect: false });
    const { id: stripeCustomerId } = await params;

    if (!stripeCustomerId || stripeCustomerId === "—") {
      return NextResponse.json({ totalInvoiced: 0 });
    }

    const { billing } = getServices();
    const invoices = await billing.getInvoices(stripeCustomerId);
    return NextResponse.json({ totalInvoiced: sumInvoiceAmounts(invoices) });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json(null, { status: 404 });
    console.error("GET /api/admin/users/[id]/spend error:", err);
    return NextResponse.json({ totalInvoiced: 0 });
  }
}
