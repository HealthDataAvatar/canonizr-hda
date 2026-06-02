import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

const styles = {
  error: {
    container: "border-destructive/30 bg-background",
    icon: "text-destructive",
    text: "text-destructive",
  },
  warning: {
    container: "border-amber-500/30 bg-amber-500/5",
    icon: "text-amber-500",
    text: "text-amber-600 dark:text-amber-400",
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
      <TriangleAlert className={`mt-0.5 size-4 shrink-0 ${s.icon}`} />
      {children ? (
        <div className="flex-1">{children}</div>
      ) : (
        <p className={`flex-1 text-sm font-medium ${s.text}`}>{message}</p>
      )}
      {action}
    </div>
  );
}
