import { memo, useCallback } from "react";
import { Star, ShieldCheck, Calendar } from "lucide-react";
import { cn } from "@/components/ui/utils";
import type { JiraVersion } from "@/types";

interface VersionCardProps {
  version: JiraVersion;
  isActive: boolean;
  isFavourite: boolean;
  onClick: (id: string) => void;
  onToggleFavourite: (e: React.MouseEvent, id: string) => void;
  healthDot?: "green" | "amber" | "red";
  qaApproved?: boolean;
}

export const VersionCard = memo(function VersionCard({
  version,
  isActive,
  isFavourite,
  onClick,
  onToggleFavourite,
  healthDot,
  qaApproved,
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
        "group relative w-full overflow-hidden rounded-lg border text-left transition-all duration-150",
        isActive
          ? "border-indigo-500 bg-indigo-600 shadow-sm shadow-indigo-200 dark:shadow-indigo-900"
          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60 dark:hover:border-slate-600 dark:hover:bg-slate-800",
      )}
    >
      {/* Active accent strip */}
      {isActive && (
        <span className="absolute inset-y-0 left-0 w-1 rounded-l-lg bg-white/30" />
      )}

      <div className="px-3 py-2.5">
        {/* Top row: health dot + name + qa shield + star */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
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
            <span
              className={cn(
                "truncate text-sm font-semibold",
                isActive ? "text-white" : "text-slate-800 dark:text-slate-100",
              )}
            >
              {version.name}
            </span>
            {qaApproved && (
              <ShieldCheck
                aria-label="QA Approved"
                className={cn(
                  "h-3.5 w-3.5 shrink-0",
                  isActive ? "text-emerald-300" : "text-emerald-500 dark:text-emerald-400",
                )}
              />
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {version.released && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none",
                  isActive
                    ? "bg-white/20 text-white/90"
                    : "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
                )}
              >
                Released
              </span>
            )}
            {version.archived && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none",
                  isActive
                    ? "bg-white/20 text-white/70"
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
                    ? "text-amber-300 hover:text-amber-200"
                    : "text-amber-400 hover:text-amber-500"
                  : isActive
                    ? "text-white/30 hover:text-white/70"
                    : "text-slate-300 hover:text-amber-400 dark:text-slate-600 dark:hover:text-amber-400",
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

        {/* Bottom row: release date */}
        {version.release_date && (
          <div
            className={cn(
              "mt-1.5 flex items-center gap-1 text-[11px]",
              isActive ? "text-white/60" : "text-slate-400 dark:text-slate-500",
            )}
          >
            <Calendar className="h-2.5 w-2.5 shrink-0" />
            <span>{version.release_date}</span>
          </div>
        )}
      </div>
    </button>
  );
});
