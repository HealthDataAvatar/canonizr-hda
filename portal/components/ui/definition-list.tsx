import { cn } from "@/lib/style/utils";

export interface DefinitionListItem {
  label: string;
  value: React.ReactNode;
}

export function DefinitionList({
  items,
  className,
}: {
  items: DefinitionListItem[];
  className?: string;
}) {
  return (
    <dl className={cn("grid grid-cols-[auto_1fr] items-baseline gap-x-6 gap-y-1", className)}>
      {items.map((item) => (
        <div key={item.label} className="contents">
          <dt className="text-muted-foreground">{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
