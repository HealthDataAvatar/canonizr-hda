import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { getCurrentConfig, appendConfig } from "@/lib/data/tables";
import { route } from "@/lib/api/route";

// User-controllable billing settings. Deliberately NOT adminCapUnits — the
// admin cap is anti-abuse and the user must never be able to raise or remove it.
export const POST = route(async (request) => {
  const { userId } = await requireUser({ autoRedirect: false });
  const body = await request.json();

  const current = await getCurrentConfig(userId);
  const updated = { ...current, changedBy: userId };

  if ("paidEnabled" in body) updated.paidEnabled = Boolean(body.paidEnabled);
  if ("spendCapUnits" in body) {
    const v = body.spendCapUnits;
    if (v !== null && (typeof v !== "number" || v < 0 || !Number.isFinite(v))) {
      return NextResponse.json({ error: "spendCapUnits must be a non-negative number or null" }, { status: 400 });
    }
    updated.spendCapUnits = v;
  }

  await appendConfig(userId, updated);
  return NextResponse.json({ ok: true });
}, { label: "POST /api/billing/settings" });
