import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { auth } from "./auth";
import { getUser } from "@/lib/data/tables";

export class AuthError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * Get the authenticated user.
 * `autoRedirect: true` — redirects to /auth (pages).
 * `autoRedirect: false` — throws AuthError (API routes).
 */
export async function requireUser(
  opts: { autoRedirect: boolean },
): Promise<{ userId: string; email: string }> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    if (opts.autoRedirect) redirect("/auth");
    throw new AuthError();
  }
  return { userId: session.user.id, email: session.user.email };
}

/**
 * Get the authenticated admin user.
 * `autoRedirect: true` — calls notFound() (pages).
 * `autoRedirect: false` — throws AuthError (API routes).
 */
export async function requireAdmin(
  opts: { autoRedirect: boolean },
): Promise<{ userId: string; email: string }> {
  const { userId, email } = await requireUser(opts);
  const record = await getUser(userId);
  if (!record.isAdmin) {
    if (opts.autoRedirect) notFound();
    throw new AuthError("Not found");
  }
  return { userId, email };
}
