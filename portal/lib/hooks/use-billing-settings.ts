"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";

export interface BillingSettingsActions {
  // User-controllable only. adminCapUnits is never settable here.
  setPaidEnabled(enabled: boolean): Promise<boolean>;
  setSpendCap(spendCapUnits: number | null): Promise<boolean>;
}

async function save(body: Record<string, unknown>): Promise<boolean> {
  const res = await fetch("/api/billing/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.ok;
}

export function useBillingSettings(): BillingSettingsActions {
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);

  const setPaidEnabled = useCallback(
    async (enabled: boolean): Promise<boolean> => {
      const ok = await save({ paidEnabled: enabled });
      if (ok) refresh();
      return ok;
    },
    [refresh],
  );

  const setSpendCap = useCallback(
    async (spendCapUnits: number | null): Promise<boolean> => {
      const ok = await save({ spendCapUnits });
      if (ok) refresh();
      return ok;
    },
    [refresh],
  );

  return useMemo(
    () => ({ setPaidEnabled, setSpendCap }),
    [setPaidEnabled, setSpendCap],
  );
}
