import { describe, it, expect, vi } from "vitest";
import { auth } from "@/lib/auth/auth";
import { getUser } from "@/lib/data/tables";
import { requireUser, requireAdmin, AuthError } from "@/lib/auth/session";

vi.mock("@/lib/auth/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/data/tables", () => ({
  getUser: vi.fn(),
}));

function mockSession(overrides: Record<string, unknown> = {}) {
  const session = {
    user: { id: "user-123", email: "test@example.com", name: null, image: null, emailVerified: null, ...overrides },
    expires: "2026-12-31",
  };
  vi.mocked(auth as any).mockResolvedValue(session);
}

describe("requireUser({ autoRedirect: false })", () => {
  it("returns userId and email from valid session", async () => {
    mockSession();
    const result = await requireUser({ autoRedirect: false });
    expect(result).toEqual({ userId: "user-123", email: "test@example.com" });
  });

  it("throws AuthError when session is null", async () => {
    vi.mocked(auth as any).mockResolvedValue(null);
    await expect(requireUser({ autoRedirect: false })).rejects.toThrow(AuthError);
  });

  it("throws AuthError when user has no id", async () => {
    mockSession({ id: undefined });
    await expect(requireUser({ autoRedirect: false })).rejects.toThrow(AuthError);
  });

  it("throws AuthError when user has no email", async () => {
    mockSession({ email: undefined });
    await expect(requireUser({ autoRedirect: false })).rejects.toThrow(AuthError);
  });
});

describe("requireAdmin({ autoRedirect: false })", () => {
  it("returns userId and email for admin user", async () => {
    mockSession();
    vi.mocked(getUser as any).mockResolvedValue({ isAdmin: true });

    const result = await requireAdmin({ autoRedirect: false });
    expect(result).toEqual({ userId: "user-123", email: "test@example.com" });
  });

  it("throws AuthError for non-admin user", async () => {
    mockSession();
    vi.mocked(getUser as any).mockResolvedValue({ isAdmin: false });

    await expect(requireAdmin({ autoRedirect: false })).rejects.toThrow(AuthError);
  });

  it("throws AuthError when not authenticated", async () => {
    vi.mocked(auth as any).mockResolvedValue(null);

    await expect(requireAdmin({ autoRedirect: false })).rejects.toThrow(AuthError);
  });
});
