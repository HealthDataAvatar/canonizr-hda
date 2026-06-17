import { forwardRef } from "react";
import { cn } from "@/lib/style/utils";
import { iconTones, type IconTone } from "./icon-tones";
import type { LucideIcon } from "lucide-react";

export const iconActionBase = [
  "inline-flex items-center justify-center rounded-md p-1.5 transition-colors cursor-pointer",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
  "disabled:pointer-events-none disabled:opacity-50 border-border border-1",
];

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  title: string;
  tone?: IconTone;
}

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon: Icon, title, tone = "muted", className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        title={title}
        aria-label={title}
        className={cn(...iconActionBase, iconTones[tone].interactive, className)}
        {...props}
      >
        <Icon className="size-4" />
      </button>
    );
  },
);

IconButton.displayName = "IconButton";

export { IconButton };
