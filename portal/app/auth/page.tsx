"use client";

import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useState } from "react";

export default function AuthPage() {
  const [email, setEmail] = useState("");

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

        <div className="space-y-3">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => signIn("github", { callbackUrl: "/dashboard" })}
          >
            Continue with GitHub
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
          >
            Continue with Google
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-[0.75rem] text-muted-foreground">or</span>
          <Separator className="flex-1" />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            signIn("nodemailer", { email, callbackUrl: "/dashboard" });
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
          <Button type="submit" className="w-full">
            Send magic link
          </Button>
        </form>

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
