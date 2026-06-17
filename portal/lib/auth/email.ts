/** Orchestrates rate limiting, template construction, and transport. */

import type { EmailProviderSendVerificationRequestParams } from "@auth/core/providers/email";
import { RateLimiter, RateLimitError } from "./rate-limit";
import { buildVerificationEmail } from "./email-template";
import { sendEmail } from "./email-transport";

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const emailLimiter = new RateLimiter({ max: 3, windowMs: FIFTEEN_MINUTES });
const ipLimiter = new RateLimiter({ max: 10, windowMs: FIFTEEN_MINUTES });

export async function sendVerificationRequest({
  identifier: email,
  url,
  request,
}: EmailProviderSendVerificationRequestParams) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const [emailAllowed, ipAllowed] = await Promise.all([
    emailLimiter.check(`email:${email}`),
    ipLimiter.check(`ip:${ip}`),
  ]);

  if (!emailAllowed || !ipAllowed) {
    throw new RateLimitError();
  }

  const content = buildVerificationEmail(url);
  await sendEmail(email, content);
}
