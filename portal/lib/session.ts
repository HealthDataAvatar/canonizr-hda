import { auth } from "./auth";

/** Get the authenticated user ID or throw a 401-like error. */
export async function requireUser(): Promise<{ userId: string; email: string }> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    throw new Error("Unauthorized");
  }
  return { userId: session.user.id, email: session.user.email };
}
