import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/style/utils";
import type { LucideIcon } from "lucide-react";

const iconHintVariants = cva("inline-flex items-center justify-center", {
  variants: {
    size: {
      default: "[&_svg]:size-4",
    },
    tone: {
      muted: "text-muted-foreground",
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
  isSpinning = false,
}: {
  icon: LucideIcon;
  title: string;
  isSpinning?: boolean;
} & VariantProps<typeof iconHintVariants>) {
  return (
    <span
      title={title}
      className={cn(iconHintVariants({ size, tone }), isSpinning && "[&_svg]:animate-spin [&_svg]:[animation-duration:6s]")}
    >
      <Icon aria-label={title} />
    </span>
  );
}

export { IconHint, iconHintVariants };
