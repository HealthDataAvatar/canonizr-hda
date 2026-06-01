"use client";

import { useState, useCallback } from "react";
import { Check, Copy } from "lucide-react";
import { IconButton } from "./icon-button";


function CopyButton({
  value,
}: { value: string; className?: string }) {
  const [copied, setCopied] = useState<boolean>(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [value]);

  return (
    <IconButton
      onClick={handleCopy}
      tone={copied ? "accent" : "muted"}
      title={copied ? "Copied" : "Copy"}
      aria-label={copied ? "Copied" : "Copy"}
      icon={copied ? Check : Copy}
    />
  );
}

export { CopyButton };
