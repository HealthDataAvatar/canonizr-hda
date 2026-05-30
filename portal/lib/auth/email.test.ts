import { describe, it, expect, vi, beforeEach } from "vitest";

vi.stubEnv("COMMS_CONNECTION_STRING", "endpoint=https://test.communication.azure.com/;accesskey=dGVzdA==");
vi.stubEnv("EMAIL_FROM", "noreply@test.azurecomm.net");
vi.stubEnv("MAIL_STUB_ENDPOINT", "");

const beginSend = vi.fn().mockResolvedValue({
  pollUntilDone: vi.fn().mockResolvedValue({ status: "Succeeded" }),
});

vi.mock("@azure/communication-email", () => ({
  EmailClient: class { beginSend = beginSend; },
}));

import { sendVerificationRequest } from "./email";

describe("sendVerificationRequest", () => {
  beforeEach(() => {
    beginSend.mockClear();
  });

  it("sends an email via ACS with correct params", async () => {
    await sendVerificationRequest({
      identifier: "user@example.com",
      url: "https://example.com/auth/callback?token=abc",
    } as any);

    expect(beginSend).toHaveBeenCalledOnce();
    const message = beginSend.mock.calls[0][0];
    expect(message.senderAddress).toBe("noreply@test.azurecomm.net");
    expect(message.recipients.to).toEqual([{ address: "user@example.com" }]);
    expect(message.content.subject).toBe("Sign in to Canonizr");
    expect(message.content.html).toContain("https://example.com/auth/callback?token=abc");
  });

  it("includes the sign-in link in the email body", async () => {
    const url = "https://canonizr.com/api/auth/callback/email?token=xyz";
    await sendVerificationRequest({
      identifier: "test@test.com",
      url,
    } as any);

    const html = beginSend.mock.calls[0][0].content.html;
    expect(html).toContain(`href="${url}"`);
    expect(html).toContain("Sign in to Canonizr");
  });
});
