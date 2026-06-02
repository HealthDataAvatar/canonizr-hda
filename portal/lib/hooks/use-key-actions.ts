"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";

export interface CreateKeyResult {
  keyName: string;
  keyValue: string;
}

export interface KeyActions {
  create(name: string): Promise<CreateKeyResult | null>;
  rotate(keyId: string): Promise<boolean>;
  remove(keyId: string): Promise<boolean>;
  setQuota(keyId: string, quotaKB: number | null): Promise<boolean>;
}

export function useKeyActions(): KeyActions {
  const router = useRouter();

  const refresh = useCallback(() => router.refresh(), [router]);

  const create = useCallback(
    async (name: string): Promise<CreateKeyResult | null> => {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      refresh();
      return { keyName: name.trim(), keyValue: data.primaryKey };
    },
    [refresh],
  );

  const rotate = useCallback(
    async (keyId: string): Promise<boolean> => {
      const res = await fetch(`/api/keys/${keyId}/rotate`, { method: "POST" });
      if (!res.ok) return false;
      refresh();
      return true;
    },
    [refresh],
  );

  const remove = useCallback(
    async (keyId: string): Promise<boolean> => {
      const res = await fetch(`/api/keys/${keyId}`, { method: "DELETE" });
      if (!res.ok) return false;
      refresh();
      return true;
    },
    [refresh],
  );

  const setQuota = useCallback(
    async (keyId: string, quotaKB: number | null): Promise<boolean> => {
      const res = await fetch(`/api/keys/${keyId}/quota`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quotaKB }),
      });
      if (!res.ok) return false;
      refresh();
      return true;
    },
    [refresh],
  );

  return useMemo(
    () => ({ create, rotate, remove, setQuota }),
    [create, rotate, remove, setQuota],
  );
}
