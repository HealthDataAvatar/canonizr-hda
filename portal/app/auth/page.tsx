"use client";

import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-[1.5rem] font-semibold tracking-tight">
            Canonizr
          </h1>
          <p className="text-[0.9375rem] text-muted-foreground">
            Convert documents to Markdown.
          </p>
        </div>

        {sent ? (
          <div className="text-center space-y-2">
            <p className="text-[0.9375rem] font-semibold">Check your email</p>
            <p className="text-[0.8125rem] text-muted-foreground">
              We sent a sign-in link to{" "}
              <span className="font-mono text-foreground">{email}</span>.
            </p>
            <button
              type="button"
              onClick={() => setSent(false)}
              className="text-[0.8125rem] text-accent hover:underline cursor-pointer"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setLoading(true);
              const res = await signIn("email", { email, callbackUrl: "/dashboard", redirect: false });
              setLoading(false);
              if (res?.ok) setSent(true);
            }}
            className="space-y-3"
          >
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Sending…" : "Send sign-in link"}
            </Button>
          </form>
        )}

        <p className="text-center text-[0.75rem] text-muted-foreground">
          New here?{" "}
          <a
            href="https://canonizr.com"
            className="text-accent hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Learn more at canonizr.com
          </a>
        </p>
      </div>
    </div>
  );
}
