import { Clock, Undo2 } from "lucide-react";
import { IconHint } from "@/components/ui/icon-hint";
import { IconButton } from "./ui/icon-button";

export interface AuthEmailSentProps {
  email: string;
  sentAt: Date;
  onGoBack: () => void;
}

export function AuthEmailSent({ email, sentAt, onGoBack }: AuthEmailSentProps) {
  const timeString = sentAt.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="rounded-lg border bg-card p-6 text-center space-y-3">
      <p>
        We sent an email to{" "}
        <span className="font-mono text-accent">{email}</span>

        {" "} which contains your login link {" "}

      </p>
      <IconButton
        icon={Undo2}
        title="Go back"
      />
      <p>
        <IconHint
          icon={Clock}
          title={`Sent at ${timeString}`}
          tone="muted"
        />
      </p>
    </div>
  );
}
