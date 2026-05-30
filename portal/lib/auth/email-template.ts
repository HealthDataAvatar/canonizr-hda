/** Pure email template construction — no I/O. */

export interface VerificationEmail {
  subject: string;
  html: string;
}

export function buildVerificationEmail(url: string): VerificationEmail {
  return {
    subject: "Sign in to Canonizr",
    html: `<p>Click the link below to sign in to your Canonizr account.</p>
<p><a href="${url}">Sign in to Canonizr</a></p>
<p>If you didn't request this, you can safely ignore this email.</p>`,
  };
}
