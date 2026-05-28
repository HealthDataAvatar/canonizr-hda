"use client";

import { useState } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";

const codeBlockVariants = cva("rounded-lg overflow-hidden border border-border", {
  variants: {
    variant: {
      default: "",
      inset: "-mx-6",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

const tabVariants = cva(
  "px-3 py-2 text-[0.8125rem] cursor-pointer transition-colors",
  {
    variants: {
      active: {
        true: "text-foreground font-semibold",
        false: "text-muted-foreground hover:text-foreground",
      },
    },
    defaultVariants: {
      active: false,
    },
  }
);

interface CodeSample {
  language: string;
  code: string;
}

function CodeBlock({
  samples,
  variant,
  className,
}: {
  samples: CodeSample[];
  className?: string;
} & VariantProps<typeof codeBlockVariants>) {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = samples[activeIndex];

  return (
    <div className={cn(codeBlockVariants({ variant }), className)}>
      <div className="flex items-center justify-between border-b border-border bg-surface px-2">
        <div className="flex">
          {samples.map((sample, i) => (
            <button
              key={sample.language}
              type="button"
              onClick={() => setActiveIndex(i)}
              className={tabVariants({ active: i === activeIndex })}
              title={sample.language}
            >
              {sample.language}
            </button>
          ))}
        </div>
        <CopyButton value={active.code} size="sm" />
      </div>
      <pre className="overflow-auto h-64 bg-surface p-5 font-mono text-[0.875rem] leading-[1.6]">
        <code>{active.code}</code>
      </pre>
    </div>
  );
}

export { CodeBlock, codeBlockVariants, type CodeSample };
