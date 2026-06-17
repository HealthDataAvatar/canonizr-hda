import { CopyButton } from "@/components/ui/copy-button";
import { Close } from "@/components/ui/icons";
import { IconButton } from "@/components/ui/icon-button";
import { Mono } from "@/components/ui/mono";
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
        <Mono className="truncate">{keyValue}</Mono>
        <ActionGroup>
          <CopyButton value={keyValue} />
          <IconButton
            title="Close"
            icon={Close}
            onClick={onDismiss}
          />
        </ActionGroup>
      </CardContent>
    </Card>
  );
}
