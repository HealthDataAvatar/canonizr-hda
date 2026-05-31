import { Clock, Undo2 } from "lucide-react";
import { IconHint } from "@/components/ui/icon-hint";

export interface AuthEmailSentProps {
  email: string;
  sentAt: Date;
  onGoBack: () => void;
}

export function AuthEmailSent({ email, sentAt, onGoBack }: AuthEmailSentProps) {
  const timeString = sentAt.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="rounded-lg border bg-card p-6 text-center space-y-3">
      <p>
        We sent an email to{" "}
        <span className="font-mono font-medium">{email}</span>.
        <IconHint
          icon={Clock}
          title={`Sent at ${timeString}`}
          size="sm"
          tone="faded"
          className="ml-1.5 align-text-bottom"
        />
      </p>
      <button
        type="button"
        onClick={onGoBack}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground cursor-pointer"
      >
        <Undo2 className="h-3.5 w-3.5" />
        Go back
      </button>
    </div>
  );
}
