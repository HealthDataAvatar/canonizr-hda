import { cn } from "@/lib/style/utils";

export function Mono({
  className,
  muted,
  ...props
}: React.ComponentProps<"span"> & { muted?: boolean }) {
  return (
    <span
      className={cn("font-mono text-sm", muted && "text-muted-foreground", className)}
      {...props}
    />
  );
}
