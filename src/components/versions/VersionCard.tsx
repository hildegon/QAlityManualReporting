import { memo, useCallback } from "react";
import { Star } from "lucide-react";
import { cn } from "@/components/ui/utils";
import type { JiraVersion } from "@/types";

interface VersionCardProps {
  version: JiraVersion;
  isActive: boolean;
  isFavourite: boolean;
  /** Stable callback — called with the version id. */
  onClick: (id: string) => void;
  /** Stable callback — called with (event, version id). */
  onToggleFavourite: (e: React.MouseEvent, id: string) => void;
  /** Optional health dot: "green" | "amber" | "red" — only shown when data is cached. */
  healthDot?: "green" | "amber" | "red";
}

export const VersionCard = memo(function VersionCard({
  version,
  isActive,
  isFavourite,
  onClick,
  onToggleFavourite,
  healthDot,
}: VersionCardProps) {
  const handleClick = useCallback(() => onClick(version.id), [onClick, version.id]);
  const handleToggleFavourite = useCallback(
    (e: React.MouseEvent) => onToggleFavourite(e, version.id),
    [onToggleFavourite, version.id],
  );
  const dotColor =
    healthDot === "green"
      ? "bg-emerald-400"
      : healthDot === "amber"
        ? "bg-amber-400"
        : healthDot === "red"
          ? "bg-red-500"
          : null;

  return (
    <button
      onClick={handleClick}
      className={cn(
        "group w-full rounded-lg border px-4 py-3 text-left transition-colors",
        isActive
          ? "border-slate-800 bg-slate-800 text-white"
          : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:bg-slate-700",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {dotColor && (
            <span
              className={cn("h-2 w-2 shrink-0 rounded-full", dotColor)}
              title={
                healthDot === "green"
                  ? "All passing"
                  : healthDot === "amber"
                    ? "Partial failures"
                    : "Failures detected"
              }
            />
          )}
          <span className="truncate font-medium text-sm">{version.name}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {version.released && (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                isActive
                  ? "bg-white/20 text-white"
                  : "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
              )}
            >
              Released
            </span>
          )}
          {version.archived && (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                isActive
                  ? "bg-white/20 text-white"
                  : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400",
              )}
            >
              Archived
            </span>
          )}
          <span
            role="button"
            aria-label={isFavourite ? "Remove from favourites" : "Add to favourites"}
            onClick={handleToggleFavourite}
            className={cn(
              "rounded p-0.5 transition-colors",
              isFavourite
                ? isActive
                  ? "text-amber-300 hover:text-amber-100"
                  : "text-amber-400 hover:text-amber-500"
                : isActive
                  ? "text-white/40 hover:text-white/80"
                  : "text-slate-300 hover:text-amber-400",
            )}
          >
            <Star
              className="h-3.5 w-3.5"
              fill={isFavourite ? "currentColor" : "none"}
              strokeWidth={isFavourite ? 0 : 1.5}
            />
          </span>
        </div>
      </div>
      {version.description && (
        <p
          className={cn(
            "mt-0.5 truncate text-xs",
            isActive ? "text-white/70" : "text-slate-500 dark:text-slate-400",
          )}
        >
          {version.description}
        </p>
      )}
      {version.release_date && (
        <p
          className={cn(
            "mt-0.5 text-xs",
            isActive ? "text-white/60" : "text-slate-400 dark:text-slate-500",
          )}
        >
          {version.release_date}
        </p>
      )}
    </button>
  );
});
