import { cn } from "@/components/ui/utils";

interface SkeletonProps {
  className?: string;
}

/**
 * Pulsing placeholder rectangle used to indicate loading content.
 * Size and shape are controlled entirely via `className`.
 *
 * @example
 * <Skeleton className="h-4 w-48 rounded" />
 */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded bg-slate-200 dark:bg-slate-700", className)}
    />
  );
}
