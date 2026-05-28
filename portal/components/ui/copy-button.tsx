"use client";

import { useState, useCallback } from "react";
import { Check, Copy } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const copyButtonVariants = cva(
  "relative inline-flex items-center justify-center cursor-pointer text-muted-foreground hover:text-foreground transition-colors duration-300",
  {
    variants: {
      size: {
        default: "size-8 [&_svg]:size-4",
        sm: "size-6 [&_svg]:size-3.5",
        lg: "size-10 [&_svg]:size-5",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
);

function CopyButton({
  value,
  size,
  className,
}: { value: string; className?: string } & VariantProps<
  typeof copyButtonVariants
>) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [value]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(copyButtonVariants({ size }), className)}
      title={copied ? "Copied" : "Copy to clipboard"}
      aria-label={copied ? "Copied" : "Copy to clipboard"}
    >
      {copied ? (
        <Check className="text-accent animate-in fade-in duration-200" />
      ) : (
        <Copy className="animate-in fade-in duration-300" />
      )}
    </button>
  );
}

export { CopyButton, copyButtonVariants };
