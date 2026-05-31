"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { AuthSignInForm } from "@/components/auth-sign-in-form";
import { AuthEmailSent } from "@/components/auth-email-sent";

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [sentAt, setSentAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    const trimmed = email.trim();
    if (!trimmed) return;
    setLoading(true);
    const res = await signIn("email", { email: trimmed, callbackUrl: "/dashboard", redirect: false });
    setLoading(false);
    if (res?.ok) setSentAt(new Date());
  }

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <h1 className="tracking-tight">
            Canonizr
          </h1>
          <p className="text-muted-foreground">
            Read any file.{" "}
            <a
              href="https://canonizr.com"
              className="text-accent hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Learn more
            </a>
          </p>
        </div>

        {sentAt ? (
          <AuthEmailSent email={email} sentAt={sentAt} onGoBack={() => setSentAt(null)} />
        ) : (
          <AuthSignInForm
            email={email}
            onEmailChange={setEmail}
            loading={loading}
            onSubmit={handleSubmit}
          />
        )}
      </div>
    </div>
  );
}
