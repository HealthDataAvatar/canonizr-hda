"use client";

import { useState, useMemo } from "react";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import python from "highlight.js/lib/languages/python";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("python", python);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("json", json);

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
  "px-3 py-2 text-[0.8125rem] cursor-pointer transition-colors rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring",
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

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function accentHighlight(html: string, terms: string[]): string {
  if (terms.length === 0) return html;
  // Build a regex that matches the terms as they appear in HTML
  // (either raw or entity-escaped). Replace across/inside hljs spans.
  const escaped = terms.map((t) => escapeHtml(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "g");
  return html.replace(re, '<span class="hljs-accent">$1</span>');
}

function CodeBlock({
  samples,
  variant,
  highlight: accentTerms = [],
  className,
}: {
  samples: CodeSample[];
  highlight?: string[];
  className?: string;
} & VariantProps<typeof codeBlockVariants>) {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = samples[activeIndex];

  const highlighted = useMemo(() => {
    const lang = active.language.toLowerCase();
    let html: string;
    if (hljs.getLanguage(lang)) {
      html = hljs.highlight(active.code, { language: lang }).value;
    } else {
      html = escapeHtml(active.code);
    }
    return accentHighlight(html, accentTerms);
  }, [active.language, active.code, accentTerms]);

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
        <code dangerouslySetInnerHTML={{ __html: highlighted }} />
      </pre>
    </div>
  );
}

export { CodeBlock, codeBlockVariants, type CodeSample };
