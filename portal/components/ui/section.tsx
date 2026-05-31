import { cn } from "@/lib/style/utils";

export function Section({
  title,
  children,
  className,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-4", className)}>
      {title && <h2>{title}</h2>}
      {children}
    </section>
  );
}
