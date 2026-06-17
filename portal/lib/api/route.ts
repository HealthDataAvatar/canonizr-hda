import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth/session";
import { logger } from "@/lib/logger";

/** An explicit HTTP error thrown from a handler; the route() wrapper renders it. */
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Wrap a route handler with the shared auth/error envelope.
 * - AuthError → 401 (user routes) or 404 (admin routes, `authStatus: 404`).
 * - ApiError → its own status + message.
 * - anything else → logged + 500.
 */
export function route<Args extends unknown[]>(
  handler: (request: Request, ...args: Args) => Promise<Response>,
  { authStatus = 401, label }: { authStatus?: 401 | 404; label?: string } = {},
) {
  return async (request: Request, ...args: Args): Promise<Response> => {
    try {
      return await handler(request, ...args);
    } catch (err) {
      if (err instanceof AuthError) {
        return authStatus === 404
          ? NextResponse.json(null, { status: 404 })
          : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      if (err instanceof ApiError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      logger.error({ err }, label ?? "route error");
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
  };
}
