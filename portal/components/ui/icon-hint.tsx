import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

const iconHintVariants = cva("inline-flex items-center justify-center", {
  variants: {
    size: {
      default: "[&_svg]:size-4",
      sm: "[&_svg]:size-3.5",
      lg: "[&_svg]:size-5",
    },
    tone: {
      muted: "text-muted-foreground",
      faded: "text-muted-foreground/50",
      foreground: "text-foreground",
      accent: "text-accent",
      destructive: "text-destructive",
    },
  },
  defaultVariants: {
    size: "default",
    tone: "muted",
  },
});

function IconHint({
  icon: Icon,
  title,
  size,
  tone,
  className,
}: {
  icon: LucideIcon;
  title: string;
} & VariantProps<typeof iconHintVariants> & {
  className?: string;
}) {
  return (
    <span
      title={title}
      className={cn(iconHintVariants({ size, tone }), className)}
    >
      <Icon aria-label={title} />
    </span>
  );
}

export { IconHint, iconHintVariants };
