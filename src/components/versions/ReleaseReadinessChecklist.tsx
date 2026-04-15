import { ListChecks, CheckCircle2, XCircle, AlertTriangle, Loader2, Calendar } from "lucide-react";
import type { useVersionRunStats } from "@/services/queries";
import { CRITICAL_PRIORITIES, normalizeStatusKey } from "@/constants/statuses";
import { cn } from "@/components/ui/utils";
import type { JiraBug, JiraVersion, TestExecution } from "@/types";
import type { IssueRow } from "./FeedbackPanel";

interface ChecklistItem {
  label: string;
  detail: string;
  metric: string;
  pass: boolean;
  loading?: boolean;
  /** Override binary pass/fail coloring with a 3-way severity */
  severity?: "green" | "amber" | "red";
}

interface ReleaseReadinessChecklistProps {
  stats: ReturnType<typeof useVersionRunStats>;
  executions: TestExecution[];
  bugs: JiraBug[];
  versionIssues: JiraBug[];
  version: JiraVersion;
  feedbackRows?: IssueRow[];
}

function ReleaseDatePill({ version }: { version: JiraVersion }) {
  if (!version.release_date) return null;

  const release = new Date(version.release_date + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysUntil = Math.ceil((release.getTime() - today.getTime()) / 86400000);
  const formatted = release.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  if (version.released) {
    return (
      <span className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
        <Calendar className="h-3 w-3" />
        Released {formatted}
      </span>
    );
  }

  if (daysUntil < 0) {
    return (
      <span className="flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
        <Calendar className="h-3 w-3" />
        Overdue · {formatted}
      </span>
    );
  }

  if (daysUntil === 0) {
    return (
      <span className="flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
        <Calendar className="h-3 w-3" />
        Due today
      </span>
    );
  }

  if (daysUntil <= 7) {
    return (
      <span className="flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
        <Calendar className="h-3 w-3" />
        Due in {daysUntil}d · {formatted}
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
      <Calendar className="h-3 w-3" />
      {formatted}
    </span>
  );
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

  // Normalize raw Xray status keys (e.g. "NOT RUN", "PASSED", "TO DO") before counting
  const nc: Record<string, number> = {};
  for (const [raw, count] of Object.entries(stats.counts)) {
    const key = normalizeStatusKey(raw);
    nc[key] = (nc[key] ?? 0) + count;
  }

  const todoCount = (nc["TODO"] ?? 0) + (nc["EXECUTING"] ?? 0);
  const failCount = (nc["FAIL"] ?? 0) + (nc["BLOCKED"] ?? 0);

  const executionRate = stats.total > 0
    ? Math.round(((stats.total - todoCount) / stats.total) * 100)
    : null;
  const executionSeverity: "green" | "amber" | "red" | undefined =
    isLoading || executionRate === null
      ? undefined
      : executionRate >= 90
        ? "green"
        : executionRate >= 60
          ? "amber"
          : "red";
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
  const blockedCount = versionIssues.filter((i) =>
    /block/i.test(i.fields.status?.name ?? ""),
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
        : stats.total === 0
          ? "No test runs yet"
          : todoCount === 0
            ? "No pending tests"
            : `${todoCount} test${todoCount !== 1 ? "s" : ""} not yet run`,
      metric: isLoading ? "…" : executionRate === null ? "—" : `${executionRate}%`,
      pass: !isLoading && todoCount === 0 && stats.total > 0,
      loading: isLoading,
      ...(executionSeverity !== undefined ? { severity: executionSeverity } : {}),
    },
    {
      label: "No test failures",
      detail: isLoading
        ? "Loading…"
        : stats.total === 0
          ? "No test runs yet"
          : failCount === 0
            ? "All executed tests passed"
            : `${failCount} failure${failCount !== 1 ? "s" : ""} or blocked`,
      metric: isLoading ? "…" : stats.total === 0 ? "—" : String(failCount),
      pass: !isLoading && stats.total > 0 && failCount === 0,
      loading: isLoading,
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
      label: "No blocked stories",
      detail:
        blockedCount === 0
          ? "No developer work blocked"
          : `${blockedCount} issue${blockedCount !== 1 ? "s" : ""} blocked`,
      metric: blockedCount === 0 ? "✓" : String(blockedCount),
      pass: blockedCount === 0,
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
  ];

  const passCount = items.filter((i) => i.pass).length;
  const allPassing = passCount === items.length;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5 dark:border-slate-700">
        <div className="flex flex-wrap items-center gap-2">
          <ListChecks className="h-4 w-4 text-slate-500 dark:text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Release readiness</h3>
          <ReleaseDatePill version={version} />
        </div>
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

      <ul className="divide-y divide-slate-100 dark:divide-slate-700/60">
        {items.map((item) => {
          const sev = item.severity;
          const iconColor = sev === "green"
            ? "text-emerald-500"
            : sev === "amber"
              ? "text-amber-500"
              : sev === "red"
                ? "text-red-400"
                : item.pass
                  ? "text-emerald-500"
                  : "text-red-400";
          const metricColor = sev === "green"
            ? "text-emerald-600 dark:text-emerald-400"
            : sev === "amber"
              ? "text-amber-600 dark:text-amber-400"
              : sev === "red"
                ? "text-red-500 dark:text-red-400"
                : item.pass
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-500 dark:text-red-400";
          return (
          <li key={item.label} className="flex items-center gap-3 px-4 py-2">
            <span className="shrink-0">
              {item.loading ? (
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              ) : sev === "amber" ? (
                <AlertTriangle className={cn("h-4 w-4", iconColor)} />
              ) : item.pass || sev === "green" ? (
                <CheckCircle2 className={cn("h-4 w-4", iconColor)} />
              ) : (
                <XCircle className={cn("h-4 w-4", iconColor)} />
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
                item.loading ? "text-slate-400" : metricColor,
              )}
            >
              {item.metric}
            </span>
          </li>
          );
        })}
      </ul>
    </div>
  );
}
