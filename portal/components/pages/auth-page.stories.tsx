import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Showcase, TEST_EMAILS } from "@/.storybook/common";
import { AuthPageContent } from "./auth-page-content";

const noop = () => {};

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

const meta = {
  title: "Pages/AuthPage",
  component: AuthInteractive,
} satisfies Meta<typeof AuthInteractive>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Interactive: Story = {};

export const AllStates: Story = {
  render: () => (
    <Showcase
      items={[
        { label: "Default", children: <AuthPageContent email="" sentAt={null} loading={false} onEmailChange={noop} onSubmit={noop} onGoBack={noop} /> },
        { label: "Email entered", children: <AuthPageContent email={TEST_EMAILS.short} sentAt={null} loading={false} onEmailChange={noop} onSubmit={noop} onGoBack={noop} /> },
        { label: "Long email", children: <AuthPageContent email={TEST_EMAILS.long} sentAt={null} loading={false} onEmailChange={noop} onSubmit={noop} onGoBack={noop} /> },
        { label: "Sending", children: <AuthPageContent email={TEST_EMAILS.short} sentAt={null} loading={true} onEmailChange={noop} onSubmit={noop} onGoBack={noop} /> },
        { label: "Email sent", children: <AuthPageContent email={TEST_EMAILS.short} sentAt={new Date()} loading={false} onEmailChange={noop} onSubmit={noop} onGoBack={noop} /> },
        { label: "Email sent (long)", children: <AuthPageContent email={TEST_EMAILS.long} sentAt={new Date()} loading={false} onEmailChange={noop} onSubmit={noop} onGoBack={noop} /> },
      ]}
    />
  ),
};
