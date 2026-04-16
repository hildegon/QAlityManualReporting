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

interface PriorityMeta {
  dot: string;
  text: string;
  ring: string;
  bg: string;
}

const DEFAULT_PRIORITY_META: PriorityMeta = {
  dot: "bg-slate-400",
  text: "text-slate-700 dark:text-slate-200",
  ring: "ring-slate-300 dark:ring-slate-600",
  bg: "bg-slate-100 dark:bg-slate-700/60",
};

const PRIORITY_META: Record<string, PriorityMeta> = {
  blocker:  { dot: "bg-red-600", text: "text-red-800 dark:text-red-200", ring: "ring-red-500 dark:ring-red-700", bg: "bg-red-100 dark:bg-red-900/60" },
  critical: { dot: "bg-red-500", text: "text-red-800 dark:text-red-200", ring: "ring-red-400 dark:ring-red-600", bg: "bg-red-100 dark:bg-red-900/50" },
  high:     { dot: "bg-orange-500", text: "text-orange-800 dark:text-orange-200", ring: "ring-orange-400 dark:ring-orange-600", bg: "bg-orange-100 dark:bg-orange-900/50" },
  medium:   { dot: "bg-yellow-500", text: "text-yellow-800 dark:text-yellow-200", ring: "ring-yellow-400 dark:ring-yellow-600", bg: "bg-yellow-100 dark:bg-yellow-900/50" },
  low:      { dot: "bg-blue-400", text: "text-blue-800 dark:text-blue-200", ring: "ring-blue-400 dark:ring-blue-600", bg: "bg-blue-100 dark:bg-blue-900/50" },
  trivial: DEFAULT_PRIORITY_META,
  unset: DEFAULT_PRIORITY_META,
};

const PRIORITY_ORDER = ["blocker", "critical", "high", "medium", "low", "trivial", "unset"] as const;

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
  const unresolvedItems = rows.filter((r) => !r.isDone);
  const doneCount = rows.filter((r) => r.isDone).length;
  const total = rows.length;
  const carryOverItems = unresolvedItems.filter((r) => !!r.carryOverFrom);
  const carryOverTotal = rows.filter((r) => !!r.carryOverFrom).length;

  const priorityCounts: Record<string, number> = {};
  for (const r of unresolvedItems) {
    const key = (r.priority || "unset").toLowerCase();
    priorityCounts[key] = (priorityCounts[key] ?? 0) + 1;
  }
  const sortedPriorities = Object.entries(priorityCounts).sort(([a], [b]) => {
    const ai = PRIORITY_ORDER.indexOf(a as typeof PRIORITY_ORDER[number]);
    const bi = PRIORITY_ORDER.indexOf(b as typeof PRIORITY_ORDER[number]);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const allDone = openItems.length === 0 && inProgressItems.length === 0 && total > 0;
  const criticalCount = (priorityCounts["blocker"] ?? 0) + (priorityCounts["critical"] ?? 0);
  const hasOpenCritical = criticalCount > 0;
  const highCount = priorityCounts["high"] ?? 0;
  const unresolvedCount = unresolvedItems.length;
  const headlineTone = allDone
    ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40"
    : hasOpenCritical
      ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/40"
      : openItems.length > 0
        ? "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40"
        : "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40";
  const headlineText = allDone
    ? `All ${total} feedback ${total === 1 ? "item is" : "items are"} resolved`
    : hasOpenCritical
      ? `${criticalCount} blocker/critical ${criticalCount === 1 ? "item still needs" : "items still need"} attention`
      : highCount > 0
        ? `${highCount} high-priority ${highCount === 1 ? "item is" : "items are"} still open`
        : `${unresolvedCount} unresolved feedback ${unresolvedCount === 1 ? "item remains" : "items remain"}`;
  const statusSegments = [
    { key: "open", count: openItems.length, className: "bg-amber-400 dark:bg-amber-500" },
    { key: "in-progress", count: inProgressItems.length, className: "bg-blue-500 dark:bg-blue-400" },
    { key: "done", count: doneCount, className: "bg-emerald-500 dark:bg-emerald-400" },
  ].filter((segment) => segment.count > 0);

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
        <div className="space-y-3">
          <div className={cn("rounded-xl border px-3 py-2", headlineTone)}>
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
              Release signal
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
              {headlineText}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-900/40">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                Severity snapshot
              </div>
              <div className="mt-1 text-2xl font-bold leading-none text-slate-900 dark:text-slate-50">
                {unresolvedCount}
              </div>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                {hasOpenCritical
                  ? `${criticalCount} blocker/critical ${criticalCount === 1 ? "item" : "items"} in unresolved feedback`
                  : "Priority mix across unresolved feedback"}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {sortedPriorities.map(([priority, count]) => {
                  const meta = PRIORITY_META[priority] ?? DEFAULT_PRIORITY_META;
                  return (
                    <span
                      key={priority}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1",
                        meta.bg,
                        meta.text,
                        meta.ring,
                      )}
                    >
                      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
                      {count} {priority}
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-900/40">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                Open-work status
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-50">
                {openItems.length} open · {inProgressItems.length} in progress
              </div>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                {doneCount} resolved
                {carryOverItems.length > 0
                  ? ` · ${carryOverItems.length} carry-over ${carryOverItems.length === 1 ? "item" : "items"}`
                  : ""}
              </p>
              <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                {statusSegments.map((segment) => (
                  <div
                    key={segment.key}
                    className={segment.className}
                    style={{ width: `${(segment.count / total) * 100}%` }}
                  />
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                  {openItems.length} open
                </span>
                <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 font-medium text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
                  {inProgressItems.length} in progress
                </span>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                  {doneCount} done
                </span>
                {carryOverItems.length > 0 && (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                    {carryOverItems.length} carry-over
                  </span>
                )}
              </div>
            </div>
          </div>

          {carryOverItems.length > 0 && (
            <div className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 dark:border-amber-800 dark:bg-amber-900/40">
              <ArrowLeftRight className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
              <span className="text-xs text-amber-700 dark:text-amber-300">
                <strong className="font-semibold">{carryOverItems.length}</strong> unresolved{" "}
                {carryOverItems.length === 1 ? "issue" : "issues"} carried over from previous releases
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
