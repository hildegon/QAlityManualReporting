import { useMemo } from "react";
import {
  MessageSquare,
  AlertTriangle,
  CheckCircle2,
  CircleDot,
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

const PRIORITY_ORDER = ["critical", "high", "medium", "low"] as const;

const PRIORITY_META: Record<string, { dot: string; bg: string; text: string; ring: string }> = {
  critical: {
    dot: "bg-red-500",
    bg: "bg-red-50 dark:bg-red-950/40",
    text: "text-red-700 dark:text-red-300",
    ring: "ring-red-200 dark:ring-red-800",
  },
  high: {
    dot: "bg-orange-500",
    bg: "bg-orange-50 dark:bg-orange-950/40",
    text: "text-orange-700 dark:text-orange-300",
    ring: "ring-orange-200 dark:ring-orange-800",
  },
  medium: {
    dot: "bg-yellow-500",
    bg: "bg-yellow-50 dark:bg-yellow-950/40",
    text: "text-yellow-700 dark:text-yellow-300",
    ring: "ring-yellow-200 dark:ring-yellow-800",
  },
  low: {
    dot: "bg-blue-400",
    bg: "bg-blue-50 dark:bg-blue-950/40",
    text: "text-blue-700 dark:text-blue-300",
    ring: "ring-blue-200 dark:ring-blue-800",
  },
};

const DEFAULT_PRIORITY_META = {
  dot: "bg-slate-400",
  bg: "bg-slate-50 dark:bg-slate-800",
  text: "text-slate-600 dark:text-slate-300",
  ring: "ring-slate-200 dark:ring-slate-700",
};

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

  const openItems = useMemo(() => rows.filter((r) => !r.isDone), [rows]);
  const doneCount = rows.length - openItems.length;
  const total = rows.length;

  const priorityCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of openItems) {
      const key = (r.priority || "unset").toLowerCase();
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [openItems]);

  const sortedPriorities = useMemo(() => {
    const entries = Object.entries(priorityCounts);
    return entries.sort(([a], [b]) => {
      const ai = PRIORITY_ORDER.indexOf(a as typeof PRIORITY_ORDER[number]);
      const bi = PRIORITY_ORDER.indexOf(b as typeof PRIORITY_ORDER[number]);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }, [priorityCounts]);

  if (!rwLoading && !entry) return null;

  const isLoading = rwLoading || pageLoading;

  if (isLoading) {
    return (
      <div className="mb-4 rounded-xl border border-slate-200 bg-white/60 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading feedback…
        </div>
      </div>
    );
  }

  if (!page || total === 0) {
    return (
      <div className="mb-4 rounded-xl border border-slate-200 bg-white/60 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <MessageSquare className="h-4 w-4" />
            Feedback page linked — no issues recorded yet.
          </div>
          {entry?.url && (
            <button
              onClick={() => void openUrl(entry.url!)}
              className="rounded-md px-2 py-1 text-xs text-indigo-500 transition-colors hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/40"
              title="Open in Confluence"
            >
              <ExternalLink className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  const donePercent = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  const hasOpenCritical = (priorityCounts["critical"] ?? 0) > 0;
  const hasOpenHigh = (priorityCounts["high"] ?? 0) > 0;
  const allDone = openItems.length === 0;

  // Build stacked bar segments
  const barSegments = sortedPriorities.map(([p, count]) => ({
    key: p,
    percent: (count / total) * 100,
    color: (PRIORITY_META[p] ?? DEFAULT_PRIORITY_META).dot,
  }));
  barSegments.push({
    key: "done",
    percent: (doneCount / total) * 100,
    color: "bg-emerald-500",
  });

  return (
    <div
      className={cn(
        "mb-4 rounded-xl border shadow-sm",
        allDone
          ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/30"
          : hasOpenCritical
            ? "border-red-200 bg-red-50/40 dark:border-red-800/60 dark:bg-red-950/20"
            : hasOpenHigh
              ? "border-orange-200 bg-orange-50/40 dark:border-orange-800/60 dark:bg-orange-950/20"
              : "border-slate-200 bg-white/60 dark:border-slate-700 dark:bg-slate-900/60",
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <MessageSquare
          className={cn(
            "h-4 w-4",
            allDone ? "text-emerald-500" : "text-slate-500 dark:text-slate-400",
          )}
        />
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Feedback
        </span>
        <span className="text-xs text-slate-400 dark:text-slate-500">
          · {total} issue{total !== 1 ? "s" : ""}
        </span>
        {entry?.url && (
          <button
            onClick={() => void openUrl(entry.url!)}
            className="ml-auto flex items-center gap-1 rounded-md px-2 py-0.5 text-xs text-indigo-500 transition-colors hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/40"
            title="Open in Confluence"
          >
            Open
            <ExternalLink className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="px-4 pb-1">
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-200/60 dark:bg-slate-700/60">
          {barSegments.map((seg) =>
            seg.percent > 0 ? (
              <div
                key={seg.key}
                className={cn("transition-all duration-500", seg.color)}
                style={{ width: `${seg.percent}%` }}
              />
            ) : null,
          )}
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span className="text-[10px] text-slate-400">{donePercent}% resolved</span>
          <span className="text-[10px] text-slate-400">
            {openItems.length} open · {doneCount} done
          </span>
        </div>
      </div>

      {/* Priority tiles */}
      <div className="flex gap-2 px-4 pt-1 pb-3">
        {/* Open tile */}
        <div
          className={cn(
            "flex flex-1 flex-col items-center rounded-lg py-2 ring-1",
            allDone
              ? "bg-emerald-50 ring-emerald-200 dark:bg-emerald-950/40 dark:ring-emerald-800"
              : "bg-amber-50 ring-amber-200 dark:bg-amber-950/40 dark:ring-amber-800",
          )}
        >
          <div className="flex items-center gap-1">
            {allDone ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            )}
            <span
              className={cn(
                "text-lg font-bold leading-none",
                allDone
                  ? "text-emerald-700 dark:text-emerald-300"
                  : "text-amber-700 dark:text-amber-300",
              )}
            >
              {openItems.length}
            </span>
          </div>
          <span
            className={cn(
              "mt-0.5 text-[10px] font-medium uppercase tracking-wider",
              allDone
                ? "text-emerald-500 dark:text-emerald-400"
                : "text-amber-500 dark:text-amber-400",
            )}
          >
            {allDone ? "All done" : "Open"}
          </span>
        </div>

        {/* Per-priority tiles */}
        {sortedPriorities.map(([priority, count]) => {
          const meta = PRIORITY_META[priority] ?? DEFAULT_PRIORITY_META;
          return (
            <div
              key={priority}
              className={cn(
                "flex flex-1 flex-col items-center rounded-lg py-2 ring-1",
                meta.bg,
                meta.ring,
              )}
            >
              <div className="flex items-center gap-1">
                <CircleDot className={cn("h-3.5 w-3.5", meta.text)} />
                <span className={cn("text-lg font-bold leading-none", meta.text)}>
                  {count}
                </span>
              </div>
              <span
                className={cn(
                  "mt-0.5 text-[10px] font-medium capitalize tracking-wider",
                  meta.text,
                  "opacity-70",
                )}
              >
                {priority}
              </span>
            </div>
          );
        })}

        {/* Done tile */}
        <div className="flex flex-1 flex-col items-center rounded-lg bg-emerald-50 py-2 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:ring-emerald-800">
          <div className="flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            <span className="text-lg font-bold leading-none text-emerald-700 dark:text-emerald-300">
              {doneCount}
            </span>
          </div>
          <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-500 dark:text-emerald-400">
            Done
          </span>
        </div>
      </div>
    </div>
  );
}
