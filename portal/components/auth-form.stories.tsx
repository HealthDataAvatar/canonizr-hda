import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AuthSignInForm } from "./auth-sign-in-form";
import { AuthEmailSent } from "./auth-email-sent";

// ---------------------------------------------------------------------------
// Interactive wrapper
// ---------------------------------------------------------------------------

function AuthInteractive() {
  const [email, setEmail] = useState("");
  return (
    <AuthSignInForm
      email={email}
      onEmailChange={setEmail}
      loading={false}
      onSubmit={() => {}}
    />
  );
}

const meta = {
  title: "Pages/Auth",
  component: AuthInteractive,
} satisfies Meta<typeof AuthInteractive>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Interactive: Story = {};

export const AllStates: Story = {
  render: () => (
    <div className="space-y-8 max-w-sm">
      <div>
        <p className="text-xs text-muted-foreground mb-2">Default</p>
        <AuthSignInForm
          email=""
          onEmailChange={() => {}}
          loading={false}
          onSubmit={() => {}}
        />
      </div>

      <div>
        <p className="text-xs text-muted-foreground mb-2">Email entered</p>
        <AuthSignInForm
          email="user@example.com"
          onEmailChange={() => {}}
          loading={false}
          onSubmit={() => {}}
        />
      </div>

      <div>
        <p className="text-xs text-muted-foreground mb-2">Sending</p>
        <AuthSignInForm
          email="user@example.com"
          onEmailChange={() => {}}
          loading={true}
          onSubmit={() => {}}
        />
      </div>

      <div>
        <p className="text-xs text-muted-foreground mb-2">Email sent</p>
        <AuthEmailSent
          email="user@example.com"
          sentAt={new Date()}
          onGoBack={() => {}}
        />
      </div>
    </div>
  ),
};
