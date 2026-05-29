import { describe, it, expect, vi } from "vitest";

vi.mock("./auth", () => ({
  auth: vi.fn(),
}));

import { requireUser } from "./session";
import { auth } from "./auth";

const mockAuth = vi.mocked(auth);

describe("requireUser", () => {
  it("returns userId and email from valid session", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user-123", email: "test@example.com", name: null, image: null, emailVerified: null },
      expires: "2026-12-31",
    });

    const result = await requireUser();
    expect(result).toEqual({ userId: "user-123", email: "test@example.com" });
  });

  it("throws when session is null", async () => {
    mockAuth.mockResolvedValue(null);
    await expect(requireUser()).rejects.toThrow("Unauthorized");
  });

  it("throws when user has no id", async () => {
    mockAuth.mockResolvedValue({
      user: { id: undefined as unknown as string, email: "test@example.com", name: null, image: null, emailVerified: null },
      expires: "2026-12-31",
    });
    await expect(requireUser()).rejects.toThrow("Unauthorized");
  });

  it("throws when user has no email", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user-123", email: undefined as unknown as string, name: null, image: null, emailVerified: null },
      expires: "2026-12-31",
    });
    await expect(requireUser()).rejects.toThrow("Unauthorized");
  });
});
