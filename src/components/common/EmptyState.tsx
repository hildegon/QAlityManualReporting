import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  /** Lucide icon component to display. */
  icon: LucideIcon;
  message: string;
}

/**
 * Centred empty-state placeholder shown when a list has no items.
 * Used by VersionsPage, TestExecutionsPage, TestPlansPage, CoveragePage, etc.
 */
export function EmptyState({ icon: Icon, message }: EmptyStateProps) {
  return (
    <div className="flex h-48 flex-col items-center justify-center gap-3 text-slate-400">
      <Icon className="h-10 w-10 opacity-40" />
      <p className="text-sm">{message}</p>
    </div>
  );
}
