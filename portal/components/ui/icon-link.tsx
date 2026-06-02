import { forwardRef } from "react";
import { cn } from "@/lib/style/utils";
import { iconActionBase, iconActionTones } from "./icon-button";
import type { LucideIcon } from "lucide-react";

export interface IconLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  icon: LucideIcon;
  title: string;
  tone?: keyof typeof iconActionTones;
}

const IconLink = forwardRef<HTMLAnchorElement, IconLinkProps>(
  ({ icon: Icon, title, tone = "muted", className, ...props }, ref) => {
    return (
      <a
        ref={ref}
        title={title}
        aria-label={title}
        className={cn(...iconActionBase, iconActionTones[tone], className)}
        {...props}
      >
        <Icon className="size-4" />
      </a>
    );
  },
);

IconLink.displayName = "IconLink";

export { IconLink };
