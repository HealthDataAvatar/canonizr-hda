import { forwardRef } from "react";
import { cn } from "@/lib/style/utils";
import type { LucideIcon } from "lucide-react";

export const iconActionTones = {
  accent: "text-accent/80 hover:text-accent",
  muted: "text-muted-foreground hover:text-foreground",
  destructive: "text-muted-foreground hover:text-destructive/80",
};

export const iconActionBase = [
  "inline-flex items-center justify-center rounded-md p-1.5 transition-colors cursor-pointer",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  "disabled:pointer-events-none disabled:opacity-50 border-border border-1",
];

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  title: string;
  tone?: keyof typeof iconActionTones;
}

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon: Icon, title, tone = "muted", className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        title={title}
        aria-label={title}
        className={cn(...iconActionBase, iconActionTones[tone], className)}
        {...props}
      >
        <Icon className="size-4" />
      </button>
    );
  },
);

IconButton.displayName = "IconButton";

export { IconButton };
