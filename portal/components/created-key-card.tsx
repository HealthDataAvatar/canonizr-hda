import { CopyButton } from "@/components/ui/copy-button";
import { X } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { APIKeySpan } from "@/components/ui/api-key-span";
import { ActionGroup } from "@/components/ui/action-group";
import { Card, CardContent } from "@/components/ui/card";

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
    <Card size="sm">
      <CardContent className="flex items-center justify-between gap-2">
        <span className="truncate">{keyName}</span>
        <APIKeySpan text={keyValue} />
        <ActionGroup>
          <CopyButton value={keyValue} />
          <IconButton
            title="Close"
            icon={X}
            onClick={onDismiss}
          />
        </ActionGroup>
      </CardContent>
    </Card>
  );
}
