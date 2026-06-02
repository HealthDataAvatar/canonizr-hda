"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { AuthPageContent } from "@/components/pages/auth-page-content";

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
    <AuthPageContent
      email={email}
      sentAt={sentAt}
      loading={loading}
      onEmailChange={setEmail}
      onSubmit={handleSubmit}
      onGoBack={() => setSentAt(null)}
    />
  );
}
