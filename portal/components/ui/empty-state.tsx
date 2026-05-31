export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-8 text-center text-muted-foreground">{children}</p>
  );
}
