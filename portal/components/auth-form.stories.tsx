import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Showcase, TEST_EMAILS } from "@/.storybook/common";
import { AuthSignInForm } from "./auth-sign-in-form";
import { AuthEmailSent } from "./auth-email-sent";

function AuthInteractive() {
  const [email, setEmail] = useState("");
  const [sentAt, setSentAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);

  function handleSubmit() {
    if (!email.trim()) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSentAt(new Date());
    }, 800);
  }

  if (sentAt) {
    return (
      <div className="w-full max-w-sm">
        <AuthEmailSent email={email} sentAt={sentAt} onGoBack={() => setSentAt(null)} />
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <AuthSignInForm
        email={email}
        onEmailChange={setEmail}
        loading={loading}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

const meta = {
  title: "Components/AuthForm",
  component: AuthInteractive,
} satisfies Meta<typeof AuthInteractive>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Interactive: Story = {};

export const AllStates: Story = {
  render: () => (
    <Showcase
      maxWidth="max-w-sm"
      items={[
        { label: "Default", children: <AuthSignInForm email="" onEmailChange={() => {}} loading={false} onSubmit={() => {}} /> },
        { label: "Email entered", children: <AuthSignInForm email={TEST_EMAILS.short} onEmailChange={() => {}} loading={false} onSubmit={() => {}} /> },
        { label: "Long email", children: <AuthSignInForm email={TEST_EMAILS.long} onEmailChange={() => {}} loading={false} onSubmit={() => {}} /> },
        { label: "Sending", children: <AuthSignInForm email={TEST_EMAILS.short} onEmailChange={() => {}} loading={true} onSubmit={() => {}} /> },
        { label: "Email sent", children: <AuthEmailSent email={TEST_EMAILS.short} sentAt={new Date()} onGoBack={() => {}} /> },
        { label: "Email sent (long)", children: <AuthEmailSent email={TEST_EMAILS.long} sentAt={new Date()} onGoBack={() => {}} /> },
      ]}
    />
  ),
};
