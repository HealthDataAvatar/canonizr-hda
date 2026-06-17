"use client";

import { useState, useCallback } from "react";
import { Copy } from "lucide-react";
import { Success } from "@/components/ui/icons";
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
      icon={copied ? Success : Copy}
    />
  );
}

export { CopyButton };
