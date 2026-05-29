import { CopyButton } from "@/components/ui/copy-button";
import { X } from "lucide-react";

export interface CreatedKeyCardProps {
  keyName: string;
  keyValue: string;
  onDismiss: () => void;
}

export function CreatedKeyCard({
  keyName,
  keyValue,
  onDismiss,
}: CreatedKeyCardProps) {
  return (
    <div className="relative rounded-lg border border-border p-5 space-y-4">
      <button
        type="button"
        onClick={onDismiss}
        className="absolute top-3 right-3 rounded-sm p-1 text-muted-foreground hover:text-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
        aria-label="Dismiss"
      >
        <X className="size-4" />
      </button>
      <p className="text-[0.9375rem] font-semibold font-mono pr-8">{keyName}</p>
      <div className="flex items-center gap-2 rounded-md bg-surface px-4 py-3">
        <code className="flex-1 break-all font-mono text-[0.875rem]">
          {keyValue}
        </code>
        <CopyButton value={keyValue} />
      </div>
    </div>
  );
}
