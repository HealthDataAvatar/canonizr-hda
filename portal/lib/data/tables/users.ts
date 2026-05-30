/** Users table — read + update. Creation is owned by the next-auth adapter. */

import { getTableClient } from "@/lib/data/table-client";
import { TableName } from "@/lib/data/table-names";

export interface UserRecord {
  id: string;
  email: string;
  encryptionKey: string;
  stripeCustomerId: string;
  maxKeys: number;
  freeUnits: number | null;
  pricePerUnit: number;
  notes: string;
  isAdmin: boolean;
  blocked: boolean;
}

export async function getUser(userId: string): Promise<UserRecord> {
  const client = getTableClient(TableName.USERS);
  const entity = await client.getEntity("user", userId);
  return {
    id: entity.rowKey as string,
    email: entity.email as string,
    encryptionKey: entity.encryptionKey as string,
    stripeCustomerId: (entity.stripeCustomerId as string) ?? "",
    maxKeys: (entity.maxKeys as number) ?? 100,
    freeUnits: (entity.freeUnits as number) ?? null,
    pricePerUnit: (entity.pricePerUnit as number) ?? 0.003,
    notes: (entity.notes as string) ?? "",
    isAdmin: (entity.isAdmin as boolean) ?? false,
    blocked: (entity.blocked as boolean) ?? false,
  };
}

export type UserUpdateFields = Partial<
  Pick<UserRecord, "stripeCustomerId" | "maxKeys" | "freeUnits" | "pricePerUnit" | "notes" | "blocked">
>;

export async function updateUser(userId: string, fields: UserUpdateFields): Promise<void> {
  const client = getTableClient(TableName.USERS);
  await client.updateEntity(
    { partitionKey: "user", rowKey: userId, ...fields },
    "Merge",
  );
}
