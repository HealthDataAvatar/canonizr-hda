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

function getEmailClient(): EmailClient {
  // Production — endpoint + managed identity
  const endpoint = process.env.COMMS_ENDPOINT;
  if (endpoint) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DefaultAzureCredential } = require("@azure/identity");
    return new EmailClient(endpoint, new DefaultAzureCredential());
  }

  // Fallback — connection string (local dev without mail stub)
  const connStr = process.env.COMMS_CONNECTION_STRING;
  if (connStr) {
    return new EmailClient(connStr);
  }

  throw new Error("Set COMMS_ENDPOINT or COMMS_CONNECTION_STRING");
}

const sendViaAzure = async (to: string, content: VerificationEmail) => {
  try {
    const client = getEmailClient();

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
