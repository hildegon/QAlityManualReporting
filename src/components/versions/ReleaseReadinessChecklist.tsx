import { ListChecks, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import type { useVersionRunStats } from "@/services/queries";
import { CRITICAL_PRIORITIES } from "@/constants/statuses";
import { cn } from "@/components/ui/utils";
import type { JiraBug, JiraVersion, TestExecution } from "@/types";
import type { IssueRow } from "./FeedbackPanel";

interface ChecklistItem {
  label: string;
  detail: string;
  metric: string;
  pass: boolean;
  loading?: boolean;
}

interface ReleaseReadinessChecklistProps {
  stats: ReturnType<typeof useVersionRunStats>;
  executions: TestExecution[];
  bugs: JiraBug[];
  versionIssues: JiraBug[];
  version: JiraVersion;
  feedbackRows?: IssueRow[];
}

export function ReleaseReadinessChecklist({
  stats,
  executions,
  bugs,
  versionIssues,
  version,
  feedbackRows = [],
}: ReleaseReadinessChecklistProps) {
  const isLoading = stats.pagesLoaded < stats.pagesExpected;

  const passCount2 = stats.counts["PASS"] ?? stats.counts["PASSED"] ?? 0;
  const passRate = stats.total > 0 ? Math.round((passCount2 / stats.total) * 100) : null;
  const todoCount =
    (stats.counts["TODO"] ?? stats.counts["NOT RUN"] ?? 0) + (stats.counts["EXECUTING"] ?? 0);
  const feedbackOpen = feedbackRows.filter((r) => !r.isDone && !r.isInProgress).length;
  const feedbackInProgress = feedbackRows.filter((r) => r.isInProgress).length;
  const feedbackPending = feedbackOpen + feedbackInProgress;
  const feedbackHasCritical = feedbackRows.some(
    (r) => !r.isDone && CRITICAL_PRIORITIES.has(r.priority?.toLowerCase() ?? ""),
  );
  const feedbackTotal = feedbackRows.length;
  const criticalBugCount = bugs.filter(
    (b) =>
      b.fields.status?.category?.key !== "done" &&
      CRITICAL_PRIORITIES.has(b.fields.priority?.name?.toLowerCase() ?? ""),
  ).length;
  const storiesTotal = versionIssues.length;
  const storiesDone = versionIssues.filter(
    (i) =>
      i.fields.status?.category?.key === "done" || /acceptance/i.test(i.fields.status?.name ?? ""),
  ).length;

  const items: ChecklistItem[] = [
    {
      label: "Test executions",
      detail:
        executions.length === 0
          ? "No executions linked to this version"
          : `${executions.length} execution${executions.length !== 1 ? "s" : ""} linked`,
      metric: executions.length === 0 ? "0" : String(executions.length),
      pass: executions.length > 0,
    },
    {
      label: "All tests executed",
      detail: isLoading
        ? "Loading…"
        : todoCount === 0 && stats.total > 0
          ? "No pending tests"
          : `${todoCount} test${todoCount !== 1 ? "s" : ""} not yet run`,
      metric: isLoading ? "…" : passRate === null ? "—" : `${passRate}%`,
      pass: !isLoading && todoCount === 0 && stats.total > 0,
      loading: isLoading,
    },
    {
      label: "Feedback resolved",
      detail:
        feedbackTotal === 0
          ? "No feedback page linked"
          : feedbackPending === 0
            ? `All ${feedbackTotal} items resolved`
            : feedbackHasCritical
              ? `${feedbackPending} pending — includes critical`
              : `${feedbackPending} still open or in progress`,
      metric:
        feedbackTotal === 0
          ? "—"
          : feedbackPending === 0
            ? "✓"
            : String(feedbackPending),
      pass: feedbackTotal > 0 && feedbackPending === 0,
    },
    {
      label: "No critical bugs",
      detail:
        criticalBugCount === 0
          ? "No unresolved critical or blocker bugs"
          : `${criticalBugCount} unresolved critical/blocker`,
      metric: String(criticalBugCount),
      pass: criticalBugCount === 0,
    },
    {
      label: "Stories in acceptance",
      detail:
        storiesTotal === 0
          ? "No issues linked to this version"
          : storiesDone === storiesTotal
            ? `All ${storiesTotal} done or in acceptance`
            : `${storiesDone} / ${storiesTotal} done or in acceptance`,
      metric: storiesTotal === 0 ? "—" : `${storiesDone}/${storiesTotal}`,
      pass: storiesTotal > 0 && storiesDone === storiesTotal,
    },
  ];

  const passCount = items.filter((i) => i.pass).length;
  const allPassing = passCount === items.length;
  const isReleased = version.released === true;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-slate-500 dark:text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Release readiness</h3>
        </div>
        <div className="flex items-center gap-2">
          {isReleased && (
            <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300">
              Released
            </span>
          )}
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-xs font-semibold",
              allPassing
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
            )}
          >
            {allPassing ? "Ready to release" : `${passCount} / ${items.length} criteria met`}
          </span>
        </div>
      </div>

      <ul className="divide-y divide-slate-100 dark:divide-slate-700/60">
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-3 px-4 py-2">
            <span className="shrink-0">
              {item.loading ? (
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              ) : item.pass ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : (
                <XCircle className="h-4 w-4 text-red-400" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {item.label}
              </span>
              <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">
                {item.detail}
              </span>
            </div>
            <span
              className={cn(
                "shrink-0 text-base font-bold tabular-nums",
                item.loading
                  ? "text-slate-400"
                  : item.pass
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-500 dark:text-red-400",
              )}
            >
              {item.metric}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
