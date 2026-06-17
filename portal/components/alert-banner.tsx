import { Warning } from "@/components/ui/icons";
import type { ReactNode } from "react";

const styles = {
  error: {
    container: "border-destructive/30 bg-background",
    icon: "text-destructive",
    text: "text-destructive",
  },
  warning: {
    container: "border-warning/30 bg-warning/5",
    icon: "text-warning",
    text: "text-warning",
  },
} as const;

export function AlertBanner({
  variant,
  message,
  children,
  action,
}: {
  variant: "error" | "warning";
  message?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const s = styles[variant];
  return (
    <div className={`flex items-start gap-3 rounded-lg border p-4 ${s.container}`}>
      <Warning className={`mt-0.5 size-4 shrink-0 ${s.icon}`} />
      {children ? (
        <div className="flex-1">{children}</div>
      ) : (
        <p className={`flex-1 text-sm font-medium ${s.text}`}>{message}</p>
      )}
      {action}
    </div>
  );
}
