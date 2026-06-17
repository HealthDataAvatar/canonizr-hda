import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/style/utils";
import { iconTones } from "./icon-tones";
import type { LucideIcon } from "lucide-react";

const iconHintVariants = cva("inline-flex items-center justify-center", {
  variants: {
    size: {
      default: "[&_svg]:size-4",
    },
    tone: {
      muted: iconTones.muted.static,
      foreground: iconTones.foreground.static,
      accent: iconTones.accent.static,
      destructive: iconTones.destructive.static,
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
