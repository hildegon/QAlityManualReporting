import { useMemo } from "react";
import {
  MessageSquare,
  AlertTriangle,
  ArrowLeftRight,
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
  critical: { dot: "bg-red-500", text: "text-red-800 dark:text-red-200", ring: "ring-red-400 dark:ring-red-600", bg: "bg-red-100 dark:bg-red-900/50" },
  high:     { dot: "bg-orange-500", text: "text-orange-800 dark:text-orange-200", ring: "ring-orange-400 dark:ring-orange-600", bg: "bg-orange-100 dark:bg-orange-900/50" },
  medium:   { dot: "bg-yellow-500", text: "text-yellow-800 dark:text-yellow-200", ring: "ring-yellow-400 dark:ring-yellow-600", bg: "bg-yellow-100 dark:bg-yellow-900/50" },
  low:      { dot: "bg-blue-400", text: "text-blue-800 dark:text-blue-200", ring: "ring-blue-400 dark:ring-blue-600", bg: "bg-blue-100 dark:bg-blue-900/50" },
};

const PRIORITY_ORDER = ["critical", "high", "medium", "low"] as const;

interface StatTileProps {
  count: number;
  label: string;
  colorClass: string;
  bgClass: string;
  darkBgClass: string;
  borderClass: string;
}

function StatTile({ count, label, colorClass, bgClass, darkBgClass, borderClass }: StatTileProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-xl border p-3 text-center", bgClass, darkBgClass, borderClass)}>
      <span className={cn("text-xl font-bold leading-none", colorClass)}>{count}</span>
      <span className="mt-1 text-xs text-slate-500 dark:text-slate-400">{label}</span>
    </div>
  );
}

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

  const openItems = rows.filter((r) => !r.isDone && !r.isInProgress);
  const inProgressItems = rows.filter((r) => r.isInProgress);
  const doneCount = rows.filter((r) => r.isDone).length;
  const total = rows.length;
  const carryOverItems = rows.filter((r) => !!r.carryOverFrom && !r.isDone);
  const carryOverTotal = rows.filter((r) => !!r.carryOverFrom).length;

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

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      {/* Header row */}
      <div className="mb-2 flex items-center gap-1.5">
        <MessageSquare className={cn(
          "h-3.5 w-3.5 shrink-0",
          allDone ? "text-emerald-500" : hasOpenCritical ? "text-red-500" : "text-slate-400",
        )} />
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Feedback
        </span>
        {hasOpenCritical && (
          <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
        )}
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

      {/* Body */}
      {isLoading ? (
        <div className="flex items-center gap-2 py-3 text-xs text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading…
        </div>
      ) : !page || total === 0 ? (
        <p className="py-1 text-sm text-slate-400">No issues recorded yet.</p>
      ) : allDone ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 py-1 text-sm font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            All {total} issues resolved
          </div>
          {carryOverTotal > 0 && (
            <div className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 dark:border-amber-800 dark:bg-amber-900/40">
              <ArrowLeftRight className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
              <span className="text-xs text-amber-700 dark:text-amber-300">
                {carryOverTotal} carried over from previous releases — now resolved ✓
              </span>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Stat tiles */}
          <div className="grid grid-cols-3 gap-2">
            <StatTile
              count={openItems.length}
              label="Open"
              colorClass="text-slate-500 dark:text-slate-400"
              bgClass="bg-slate-50"
              darkBgClass="dark:bg-slate-700"
              borderClass="border-slate-200 dark:border-slate-600"
            />
            <StatTile
              count={inProgressItems.length}
              label="In Progress"
              colorClass="text-yellow-600 dark:text-yellow-400"
              bgClass="bg-yellow-50"
              darkBgClass="dark:bg-yellow-950"
              borderClass="border-yellow-200 dark:border-yellow-900"
            />
            <StatTile
              count={doneCount}
              label="Done"
              colorClass="text-emerald-600 dark:text-emerald-400"
              bgClass="bg-emerald-50"
              darkBgClass="dark:bg-emerald-950"
              borderClass="border-emerald-200 dark:border-emerald-900"
            />
          </div>

          {/* Carry-over banner */}
          {carryOverItems.length > 0 && (
            <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 dark:border-amber-800 dark:bg-amber-900/40">
              <ArrowLeftRight className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
              <span className="text-xs text-amber-700 dark:text-amber-300">
                <strong className="font-semibold">{carryOverItems.length}</strong> unresolved{" "}
                {carryOverItems.length === 1 ? "issue" : "issues"} carried over from previous releases
              </span>
            </div>
          )}

          {/* Priority chips for open items */}
          {sortedPriorities.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {sortedPriorities.map(([priority, count]) => {
                const meta = PRIORITY_META[priority];
                if (!meta) return null;
                return (
                  <span
                    key={priority}
                    className={cn(
                      "flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1",
                      meta.bg, meta.text, meta.ring,
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
                    {count} {priority}
                  </span>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
