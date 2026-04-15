import { memo } from "react";
import { cn } from "@/components/ui/utils";
import { Badge } from "@/components/ui/badge";
import { statusVariant } from "@/components/ui/badge-utils";
import { Skeleton } from "@/components/ui/skeleton";
import { MiniStackedBar } from "@/components/charts/StatusCharts";
import { buildSlicesFromCounts } from "@/components/charts/status-utils";
import { Copy, Pencil, Star } from "lucide-react";
import type { TestExecution, ExecSummaryResult } from "@/types";

export interface ExecRowProps {
  exec: TestExecution;
  isFavourite: boolean;
  executionProjectKey: string;
  renameKey: string | null;
  renameDraft: string;
  renameIsPending: boolean;
  /** Pre-fetched summary from the batch query (undefined while loading). */
  summary?: ExecSummaryResult | undefined;
  summaryLoading: boolean;
  /** Called with the exec when the row is clicked. */
  onSelect: (exec: TestExecution) => void;
  /** Called with the exec to start an inline rename. */
  onStartRename: (exec: TestExecution) => void;
  onCancelRename: () => void;
  onSaveRename: (exec: TestExecution, trimmed: string) => void;
  setRenameDraft: (v: string) => void;
  onToggleFavourite: (e: React.MouseEvent, issueId: string) => void;
  onEdit: (e: React.MouseEvent, exec: TestExecution) => void;
  onClone: (e: React.MouseEvent, exec: TestExecution) => void;
}

export const ExecRow = memo(function ExecRow({
  exec,
  isFavourite,
  renameKey,
  renameDraft,
  renameIsPending,
  summary,
  summaryLoading,
  onSelect,
  onStartRename,
  onCancelRename,
  onSaveRename,
  setRenameDraft,
  onToggleFavourite,
  onEdit,
  onClone,
}: ExecRowProps) {
  const counts = summary?.counts ?? {};
  const total = summary?.total ?? 0;

  return (
    <tr
      className={cn(
        "group cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50",
        isFavourite && "bg-amber-50/40 dark:bg-amber-900/20",
      )}
      onClick={() => onSelect(exec)}
    >
      {/* Favourite star */}
      <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
        <button
          aria-label={isFavourite ? "Remove from favourites" : "Add to favourites"}
          onClick={(e) => onToggleFavourite(e, exec.issue_id)}
          className={cn(
            "rounded p-0.5 transition-colors",
            isFavourite
              ? "text-amber-400 hover:text-amber-500"
              : "text-slate-300 hover:text-amber-400",
          )}
        >
          <Star
            className="h-3.5 w-3.5"
            fill={isFavourite ? "currentColor" : "none"}
            strokeWidth={isFavourite ? 0 : 1.5}
          />
        </button>
      </td>

      <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">
        {exec.jira.key}
      </td>

      <td
        className="px-4 py-3 text-slate-800 dark:text-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {renameKey === exec.jira.key ? (
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              const trimmed = renameDraft.trim();
              if (!trimmed || trimmed === exec.jira.summary) {
                onCancelRename();
                return;
              }
              onSaveRename(exec, trimmed);
            }}
          >
            <input
              autoCorrect="off" autoCapitalize="off" spellCheck={false}
              autoFocus
              className="flex-1 rounded border border-slate-300 px-2 py-0.5 text-sm focus:border-slate-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") onCancelRename();
              }}
              disabled={renameIsPending}
            />
            <button
              type="submit"
              className="rounded px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-600"
              disabled={renameIsPending}
            >
              {renameIsPending ? "…" : "Save"}
            </button>
            <button
              type="button"
              className="rounded px-2 py-0.5 text-xs text-slate-400 hover:bg-slate-100 dark:text-slate-500 dark:hover:bg-slate-600"
              onClick={onCancelRename}
            >
              Cancel
            </button>
          </form>
        ) : (
          <div onClick={() => onStartRename(exec)} className="cursor-pointer">
            <span className="group/rename flex items-center gap-1.5">
              {exec.jira.summary}
              <Pencil className="h-3.5 w-3.5 shrink-0 text-slate-300 opacity-0 group-hover/rename:opacity-100" />
            </span>
            {summaryLoading ? (
              <Skeleton className="mt-1.5 h-1.5 w-full" />
            ) : total > 0 ? (
              <div className="mt-1.5 flex items-center gap-1.5">
                <MiniStackedBar slices={buildSlicesFromCounts(counts, total)} className="flex-1" />
                <span className="shrink-0 text-[10px] text-slate-400">
                  {total}
                </span>
              </div>
            ) : null}
          </div>
        )}
      </td>

      <td className="px-4 py-3">
        {exec.jira.status && (
          <Badge variant={statusVariant(exec.jira.status.name)}>{exec.jira.status.name}</Badge>
        )}
      </td>

      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
        {exec.jira.assignee?.display_name ?? "\u2014"}
      </td>

      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <button
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:text-slate-400"
            title="Edit status / assignee"
            onClick={(e) => onEdit(e, exec)}
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:text-slate-400"
            title="Clone execution"
            onClick={(e) => onClone(e, exec)}
          >
            <Copy className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
});
