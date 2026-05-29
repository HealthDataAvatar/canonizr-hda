import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

function AuthFormPreview() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  return (
    <div className="flex items-center justify-center px-6 py-24">
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
            onSubmit={(e) => {
              e.preventDefault();
              setSent(true);
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
              Send sign-in link
            </Button>
          </form>
        )}

        <p className="text-center text-[0.75rem] text-muted-foreground">
          New here?{" "}
          <span className="text-accent hover:underline cursor-pointer">
            Learn more at canonizr.com
          </span>
        </p>
      </div>
    </div>
  );
}

const meta = {
  title: "Pages/Auth",
  component: AuthFormPreview,
} satisfies Meta<typeof AuthFormPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SignIn: Story = {};

export const Sending: Story = {
  render: () => {
    return (
      <div className="flex items-center justify-center px-6 py-24">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-[1.5rem] font-semibold tracking-tight">
              Canonizr
            </h1>
            <p className="text-[0.9375rem] text-muted-foreground">
              Convert documents to Markdown.
            </p>
          </div>
          <form className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value="user@example.com"
                readOnly
              />
            </div>
            <Button type="button" className="w-full" disabled>
              Sending…
            </Button>
          </form>
        </div>
      </div>
    );
  },
};

export const EmailSent: Story = {
  render: () => {
    const [, setSent] = useState(true);
    return (
      <div className="flex items-center justify-center px-6 py-24">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-[1.5rem] font-semibold tracking-tight">
              Canonizr
            </h1>
            <p className="text-[0.9375rem] text-muted-foreground">
              Convert documents to Markdown.
            </p>
          </div>
          <div className="text-center space-y-2">
            <p className="text-[0.9375rem] font-semibold">Check your email</p>
            <p className="text-[0.8125rem] text-muted-foreground">
              We sent a sign-in link to{" "}
              <span className="font-mono text-foreground">user@example.com</span>.
            </p>
            <button
              type="button"
              onClick={() => setSent(false)}
              className="text-[0.8125rem] text-accent hover:underline cursor-pointer"
            >
              Use a different email
            </button>
          </div>
        </div>
      </div>
    );
  },
};
