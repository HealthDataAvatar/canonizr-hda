"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBillingSettings } from "@/lib/hooks/use-billing-settings";

export function PaidUsageSettings({
  paidEnabled,
  spendCapUnits,
}: {
  paidEnabled: boolean;
  spendCapUnits: number | null;
}) {
  const { setPaidEnabled, setSpendCap } = useBillingSettings();
  const [enabled, setEnabled] = useState(paidEnabled);
  const [cap, setCap] = useState(spendCapUnits === null ? "" : String(spendCapUnits));
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const next = !enabled;
    if (await setPaidEnabled(next)) setEnabled(next);
    setBusy(false);
  }

  async function saveCap() {
    setBusy(true);
    const trimmed = cap.trim();
    await setSpendCap(trimmed === "" ? null : Number(trimmed));
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="mb-1">Paid usage</h2>
          <p className="text-sm text-muted-foreground">
            {enabled
              ? "Enabled — usage past your free allowance is billed."
              : "Disabled — requests are blocked once you reach your free allowance."}
          </p>
        </div>
        <Button variant={enabled ? "outline" : "primary"} onClick={toggle} disabled={busy}>
          {enabled ? "Disable paid usage" : "Enable paid usage"}
        </Button>
      </div>

      <div className="space-y-1">
        <Label htmlFor="spend-cap">Spend cap (units, 1 unit = 100 KB)</Label>
        <div className="flex items-center gap-2">
          <Input
            id="spend-cap"
            type="number"
            min={0}
            placeholder="No cap"
            value={cap}
            onChange={(e) => setCap(e.target.value)}
            className="max-w-40"
          />
          <Button variant="outline" onClick={saveCap} disabled={busy}>
            Save cap
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Stops your account once this period&apos;s usage reaches the cap. Leave blank for no cap.
        </p>
      </div>
    </div>
  );
}
