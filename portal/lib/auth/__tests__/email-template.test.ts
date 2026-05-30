import { describe, it, expect } from "vitest";
import { buildVerificationEmail } from "@/lib/auth/email-template";

describe("buildVerificationEmail", () => {
  const url = "https://canonizr.com/api/auth/callback/email?token=abc123";

  it("includes the sign-in link", () => {
    const { html } = buildVerificationEmail(url);
    expect(html).toContain(`href="${url}"`);
  });

  it("has a subject line", () => {
    const { subject } = buildVerificationEmail(url);
    expect(subject).toBeTruthy();
  });

  it("includes dismissal text", () => {
    const { html } = buildVerificationEmail(url);
    expect(html).toContain("didn't request this");
  });
});
