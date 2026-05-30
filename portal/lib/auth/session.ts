import { auth } from "./auth";
import { getUserRecord } from "../services/table-storage";

/** Get the authenticated user ID or throw a 401-like error. */
export async function requireUser(): Promise<{ userId: string; email: string }> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    throw new Error("Unauthorized");
  }
  return { userId: session.user.id, email: session.user.email };
}

/** Get the authenticated admin user or throw. Non-admins see 404. */
export async function requireAdmin(): Promise<{ userId: string; email: string }> {
  const { userId, email } = await requireUser();
  const conn = process.env.TABLE_STORAGE_CONNECTION_STRING!;
  const record = await getUserRecord(conn, userId);
  if (!record.isAdmin) throw new Error("Not found");
  return { userId, email };
}
