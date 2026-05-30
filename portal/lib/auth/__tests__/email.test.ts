import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../email-transport", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

import { sendVerificationRequest } from "../email";
import { sendEmail } from "../email-transport";

const mockSend = vi.mocked(sendEmail);

function params(overrides: Record<string, unknown> = {}) {
  return {
    identifier: "user@example.com",
    url: "https://example.com/auth/callback?token=abc",
    request: new Request("http://localhost/api/auth/signin/email", {
      headers: { "x-forwarded-for": "10.0.0.1" },
    }),
    ...overrides,
  } as any;
}

describe("sendVerificationRequest", () => {
  beforeEach(() => {
    mockSend.mockClear();
  });

  it("calls sendEmail with the recipient and built template", async () => {
    await sendVerificationRequest(params());

    expect(mockSend).toHaveBeenCalledOnce();
    const [to, content] = mockSend.mock.calls[0];
    expect(to).toBe("user@example.com");
    expect(content.subject).toBeTruthy();
    expect(content.html).toContain("https://example.com/auth/callback?token=abc");
  });

  it("rate limits after max requests per email", async () => {
    // Use a unique email per test to avoid cross-test rate limit state
    const email = `rate-${Date.now()}@example.com`;
    await sendVerificationRequest(params({ identifier: email }));
    await sendVerificationRequest(params({ identifier: email }));
    await sendVerificationRequest(params({ identifier: email }));

    await expect(
      sendVerificationRequest(params({ identifier: email })),
    ).rejects.toThrow();
  });
});
