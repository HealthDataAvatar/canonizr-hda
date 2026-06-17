import { getServices } from "@/lib/services";
import { ApiError } from "@/lib/api/route";

/** Throw 404 unless `userId` owns the key `id`. */
export async function assertKeyOwned(userId: string, id: string): Promise<void> {
  const { keys } = getServices();
  const list = await keys.list(userId);
  if (!list.some((k) => k.id === id)) throw new ApiError(404, "Not found");
}

/** The user's first API key value, for proxying to the gateway. 400 if they have none. */
export async function getUserApiKey(userId: string): Promise<string> {
  const { keys } = getServices();
  const list = await keys.list(userId);
  if (list.length === 0) throw new ApiError(400, "No API key available");
  return keys.get(list[0].id);
}
