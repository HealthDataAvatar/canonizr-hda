import { AuthSignInForm } from "@/components/auth-sign-in-form";
import { AuthEmailSent } from "@/components/auth-email-sent";

export interface AuthPageContentProps {
  email: string;
  sentAt: Date | null;
  loading: boolean;
  onEmailChange: (email: string) => void;
  onSubmit: () => void;
  onGoBack: () => void;
}

export function AuthPageContent({
  email,
  sentAt,
  loading,
  onEmailChange,
  onSubmit,
  onGoBack,
}: AuthPageContentProps) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <h1 className="tracking-tight">
            Canonizr
          </h1>
          <p className="text-muted-foreground">
            Read any file.</p>
            <p>
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
          <AuthEmailSent email={email} sentAt={sentAt} onGoBack={onGoBack} />
        ) : (
          <AuthSignInForm
            email={email}
            onEmailChange={onEmailChange}
            loading={loading}
            onSubmit={onSubmit}
          />
        )}
      </div>
    </div>
  );
}
