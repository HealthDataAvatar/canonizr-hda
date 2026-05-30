import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IconHint } from "@/components/ui/icon-hint";
import { KEY_NAME_MAX_LENGTH } from "@/lib/pure/key-name-validation";
import { Dices, TriangleAlert } from "lucide-react";

export interface CreateKeyInputProps {
  name: string;
  onNameChange: (name: string) => void;
  onRandomise: () => void;
  error: string | null;
  showError: boolean;
  loading: boolean;
  onCreate: () => void;
}

export function CreateKeyInput({
  name,
  onNameChange,
  onRandomise,
  error,
  showError,
  loading,
  onCreate,
}: CreateKeyInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-2">
      <Label htmlFor="key-name">Name your new key</Label>
      <div className="flex items-center gap-3">
        <Input
          ref={inputRef}
          id="key-name"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          onFocus={() => inputRef.current?.select()}
          maxLength={KEY_NAME_MAX_LENGTH}
          aria-invalid={!!showError}
          aria-describedby={showError ? "key-name-error" : undefined}
          className="flex-1"
        />
        {showError ? (
          <>
            <IconHint icon={TriangleAlert} title={error!} tone="destructive" />
            <p id="key-name-error" className="sr-only">{error}</p>
          </>
        ) : (
          <button
            type="button"
            onClick={onRandomise}
            className="shrink-0 cursor-pointer"
          >
            <IconHint icon={Dices} title="Random name" tone="muted" />
          </button>
        )}
        <Button
          onClick={onCreate}
          disabled={loading || !!error}
        >
          {loading ? "Creating…" : "Create key"}
        </Button>
      </div>
    </div>
  );
}
