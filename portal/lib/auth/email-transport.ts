/** Email transport — sends an email via ACS or the local mail stub. */

import { EmailClient } from "@azure/communication-email";
import type { VerificationEmail } from "./email-template";

export class EmailSendError extends Error {
  constructor(
    public readonly status: string,
    public readonly detail?: unknown,
  ) {
    super(`Email send failed: ${status}`);
    this.name = "EmailSendError";
  }
}

const sendToLocalDevEndpoint = async (endpoint: string, to: string, content: VerificationEmail) => {
  await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: to, subject: content.subject, html: content.html }),
  });
  return;
}

const sendViaAzure = async (to: string, content: VerificationEmail) => {
  try {
    const client = new EmailClient(process.env.COMMS_CONNECTION_STRING!);

    const poller = await client.beginSend({
      senderAddress: process.env.EMAIL_FROM!,
      recipients: { to: [{ address: to }] },
      content,
    });

    const result = await poller.pollUntilDone();

    if (result.status !== "Succeeded") {
      throw new EmailSendError(result.status, result.error);
    }
  } catch (e) {
    if (e instanceof EmailSendError) throw e;
    throw new EmailSendError("TransportError", e);
  }
}

export async function sendEmail(
  to: string,
  content: VerificationEmail,
): Promise<void> {
  const mailStub = process.env.MAIL_STUB_ENDPOINT;
  if (mailStub) {
    await sendToLocalDevEndpoint(mailStub, to, content);
    return;
  }

  await sendViaAzure(to, content);
}
