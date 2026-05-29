import { EmailClient } from "@azure/communication-email";
import type { EmailProviderSendVerificationRequestParams } from "@auth/core/providers/email";

export async function sendVerificationRequest({
  identifier: email,
  url,
}: EmailProviderSendVerificationRequestParams) {
  const mailStub = process.env.MAIL_STUB_ENDPOINT;
  if (mailStub) {
    await fetch(mailStub, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, url }),
    });
    return;
  }

  const client = new EmailClient(process.env.COMMS_CONNECTION_STRING!);

  const poller = await client.beginSend({
    senderAddress: process.env.EMAIL_FROM!,
    recipients: { to: [{ address: email }] },
    content: {
      subject: "Sign in to Canonizr",
      html: `<p>Click the link below to sign in to your Canonizr account.</p>
<p><a href="${url}">Sign in to Canonizr</a></p>
<p>If you didn't request this, you can safely ignore this email.</p>`,
    },
  });

  const result = await poller.pollUntilDone();

  if (result.status !== "Succeeded") {
    throw new Error(`Email send failed: ${result.status} — ${JSON.stringify(result.error)}`);
  }
}
