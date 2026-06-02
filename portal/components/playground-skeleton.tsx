import { Skeleton } from "@/components/ui/skeleton";

export function PlaygroundSkeleton() {
  return (
    <div className="space-y-6">
      {/* Key selector */}
      <div className="space-y-1.5">
        <Skeleton className="h-4 w-14" />
        <Skeleton className="h-10 w-48" />
      </div>

      {/* Drop zone */}
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border px-6 py-12">
        <Skeleton className="size-8 rounded-full" />
        <Skeleton className="h-4 w-52" />
      </div>

      {/* Submit button */}
      <Skeleton className="h-10 w-full rounded-md" />
    </div>
  );
}
