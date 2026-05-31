import { CopyButton } from "@/components/ui/copy-button";
import { X } from "lucide-react";
import { IconButton } from "./ui/icon-button";
import { APIKeySpan } from "./ui/api-key-span";

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
    <div className="flex justify-between items-center gap-2 rounded-md px-4 py-3">
      New key:
      <div>
        <APIKeySpan text=
        {keyValue}
      />
      </div>
      <div>
        <CopyButton value={keyValue} />
        <IconButton
          title="Close"
          icon={X}
          onClick={onDismiss}
        /></div>
    </div>
  );
}
