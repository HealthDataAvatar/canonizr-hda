/** Users table — auth identity only. Immutable after creation. */

import { getTableClient } from "@/lib/data/table-client";
import { TableName } from "@/lib/data/table-names";

export interface UserRecord {
  id: string;
  email: string;
}

export async function getUser(userId: string): Promise<UserRecord> {
  const client = getTableClient(TableName.USERS);
  const entity = await client.getEntity("user", userId);
  return {
    id: entity.rowKey as string,
    email: entity.email as string,
  };
}
