/** GwBilling table — user_id <-> stripe_customer_id mapping, written at signup.
 *
 * Stored as partitionKey="billing", rowKey=userId, so the forward lookup
 * (user -> customer) is a point read. The webhook needs the reverse
 * (customer -> user): a single-partition filtered query. No separate index
 * table — this partition already is the index.
 */

import { getTableClient } from "@/lib/data/table-client";
import { TableName } from "@/lib/data/table-interface";

export type CustomerLookup =
  | { ok: true; userId: string }
  | { ok: false; reason: "not_found" | "ambiguous"; count: number };

/** Reverse-resolve a Stripe customer id to a user id via the GwBilling index. */
export async function getUserIdByStripeCustomerId(customerId: string): Promise<CustomerLookup> {
  const client = getTableClient(TableName.GW_BILLING);
  const entities = client.listEntities<{ rowKey: string }>({
    queryOptions: { filter: `PartitionKey eq 'billing' and stripe_customer_id eq '${customerId}'` },
  });

  const userIds: string[] = [];
  for await (const e of entities) {
    if (e.rowKey) userIds.push(e.rowKey);
  }

  if (userIds.length === 1) return { ok: true, userId: userIds[0] };
  // 0 = customer we never wrote (test/live mixup); >1 = duplicate signup.
  // Both are "don't guess" — caller emits telemetry and no-ops.
  return { ok: false, reason: userIds.length === 0 ? "not_found" : "ambiguous", count: userIds.length };
}
