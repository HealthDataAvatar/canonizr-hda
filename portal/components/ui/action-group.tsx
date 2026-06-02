import { cn } from "@/lib/style/utils";

export function ActionGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex items-center gap-1", className)}>
      {children}
    </div>
  );
}
