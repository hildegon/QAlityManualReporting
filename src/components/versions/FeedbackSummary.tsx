import { useMemo } from "react";
import {
  MessageSquare,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useVersionRelatedWork, useConfluencePage } from "@/services/queries";
import { RELATED_WORK_TITLE_PREFIX, parseIssueRows } from "./FeedbackPanel";
import { cn } from "@/components/ui/utils";
import type { JiraVersion } from "@/types";

interface FeedbackSummaryProps {
  version: JiraVersion;
}

const PRIORITY_META: Record<string, { dot: string; text: string; ring: string; bg: string }> = {
  critical: { dot: "bg-red-500", text: "text-red-700 dark:text-red-300", ring: "ring-red-300 dark:ring-red-700", bg: "bg-red-50 dark:bg-red-950/40" },
  high:     { dot: "bg-orange-500", text: "text-orange-700 dark:text-orange-300", ring: "ring-orange-300 dark:ring-orange-700", bg: "bg-orange-50 dark:bg-orange-950/40" },
  medium:   { dot: "bg-yellow-500", text: "text-yellow-700 dark:text-yellow-300", ring: "ring-yellow-300 dark:ring-yellow-700", bg: "bg-yellow-50 dark:bg-yellow-950/40" },
  low:      { dot: "bg-blue-400", text: "text-blue-700 dark:text-blue-300", ring: "ring-blue-300 dark:ring-blue-700", bg: "bg-blue-50 dark:bg-blue-950/40" },
};

const PRIORITY_ORDER = ["critical", "high", "medium", "low"] as const;

export function FeedbackSummary({ version }: FeedbackSummaryProps) {
  const { data: relatedWork, isLoading: rwLoading } = useVersionRelatedWork(version.id);

  const entry = useMemo(
    () => relatedWork?.find((rw) => rw.title?.startsWith(RELATED_WORK_TITLE_PREFIX)),
    [relatedWork],
  );

  const pageId = useMemo(() => {
    if (!entry?.url) return undefined;
    return entry.url.match(/\/pages\/(\d+)/)?.[1];
  }, [entry?.url]);

  const { data: page, isLoading: pageLoading } = useConfluencePage(pageId);

  const rows = useMemo(
    () => parseIssueRows(page?.body_storage ?? ""),
    [page?.body_storage],
  );

  if (!rwLoading && !entry) return null;

  const isLoading = rwLoading || pageLoading;

  if (isLoading) {
    return (
      <div className="mb-3 flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white/60 px-3 text-xs text-slate-400 shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading feedback…
      </div>
    );
  }

  const openItems = rows.filter((r) => !r.isDone && !r.isInProgress);
  const inProgressItems = rows.filter((r) => r.isInProgress);
  const doneCount = rows.filter((r) => r.isDone).length;
  const total = rows.length;

  const priorityCounts: Record<string, number> = {};
  for (const r of openItems) {
    const key = (r.priority || "unset").toLowerCase();
    priorityCounts[key] = (priorityCounts[key] ?? 0) + 1;
  }
  const sortedPriorities = Object.entries(priorityCounts).sort(([a], [b]) => {
    const ai = PRIORITY_ORDER.indexOf(a as typeof PRIORITY_ORDER[number]);
    const bi = PRIORITY_ORDER.indexOf(b as typeof PRIORITY_ORDER[number]);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const allDone = openItems.length === 0 && total > 0;
  const hasOpenCritical = (priorityCounts["critical"] ?? 0) > 0;
  const hasOpenHigh = (priorityCounts["high"] ?? 0) > 0;

  const borderColor = allDone
    ? "border-emerald-200 dark:border-emerald-800"
    : hasOpenCritical
      ? "border-red-200 dark:border-red-800/60"
      : hasOpenHigh
        ? "border-orange-200 dark:border-orange-800/60"
        : "border-slate-200 dark:border-slate-700";

  const bgColor = allDone
    ? "bg-emerald-50/60 dark:bg-emerald-950/20"
    : hasOpenCritical
      ? "bg-red-50/30 dark:bg-red-950/10"
      : "bg-white/60 dark:bg-slate-900/60";

  if (!page || total === 0) {
    return (
      <div className={cn("mb-3 flex h-9 items-center gap-2 rounded-lg border px-3 shadow-sm", borderColor, bgColor)}>
        <MessageSquare className="h-3.5 w-3.5 text-slate-400" />
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Feedback</span>
        <span className="text-xs text-slate-400">· no issues recorded yet</span>
        {entry?.url && (
          <button
            onClick={() => void openUrl(entry.url!)}
            className="ml-auto rounded p-0.5 text-indigo-400 hover:text-indigo-600 dark:text-indigo-400"
            title="Open in Confluence"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={cn("mb-3 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 shadow-sm", borderColor, bgColor)}>
      {/* Label */}
      <MessageSquare className={cn("h-3.5 w-3.5 shrink-0", allDone ? "text-emerald-500" : "text-slate-400")} />
      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Feedback</span>
      <span className="text-xs text-slate-400 dark:text-slate-500">·</span>

      {/* Status chips */}
      {openItems.length > 0 && (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
          {openItems.length} open
        </span>
      )}
      {inProgressItems.length > 0 && (
        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
          {inProgressItems.length} in progress
        </span>
      )}
      {doneCount > 0 && (
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
          {doneCount} done
        </span>
      )}
      {allDone && (
        <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" />
          All resolved
        </span>
      )}

      {/* Priority chips (only for open items) */}
      {sortedPriorities.length > 0 && (
        <>
          <span className="text-xs text-slate-300 dark:text-slate-600">·</span>
          {sortedPriorities.map(([priority, count]) => {
            const meta = PRIORITY_META[priority];
            if (!meta) return null;
            return (
              <span
                key={priority}
                className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1", meta.bg, meta.text, meta.ring)}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
                {count} {priority}
              </span>
            );
          })}
        </>
      )}

      {/* Alert if critical open */}
      {hasOpenCritical && (
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500" />
      )}

      {/* Open link */}
      {entry?.url && (
        <button
          onClick={() => void openUrl(entry.url!)}
          className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-indigo-500 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/40"
          title="Open in Confluence"
        >
          Open <ExternalLink className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
