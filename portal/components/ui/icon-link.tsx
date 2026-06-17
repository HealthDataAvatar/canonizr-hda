import { forwardRef } from "react";
import { cn } from "@/lib/style/utils";
import { iconActionBase } from "./icon-button";
import { iconTones, type IconTone } from "./icon-tones";
import type { LucideIcon } from "lucide-react";

export interface IconLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  icon: LucideIcon;
  title: string;
  tone?: IconTone;
}

const IconLink = forwardRef<HTMLAnchorElement, IconLinkProps>(
  ({ icon: Icon, title, tone = "muted", className, ...props }, ref) => {
    return (
      <a
        ref={ref}
        title={title}
        aria-label={title}
        className={cn(...iconActionBase, iconTones[tone].interactive, className)}
        {...props}
      >
        <Icon className="size-4" />
      </a>
    );
  },
);

IconLink.displayName = "IconLink";

export { IconLink };
