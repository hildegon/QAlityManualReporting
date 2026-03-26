import { ListChecks, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import type { useVersionRunStats } from "@/services/queries";
import { CRITICAL_PRIORITIES } from "@/constants/statuses";
import { cn } from "@/components/ui/utils";
import type { JiraBug, JiraVersion, TestExecution } from "@/types";

interface ChecklistItem {
  label: string;
  detail: string;
  pass: boolean;
  loading?: boolean;
}

interface ReleaseReadinessChecklistProps {
  stats: ReturnType<typeof useVersionRunStats>;
  executions: TestExecution[];
  bugs: JiraBug[];
  versionIssues: JiraBug[];
  version: JiraVersion;
}

export function ReleaseReadinessChecklist({
  stats,
  executions,
  bugs,
  versionIssues,
  version,
}: ReleaseReadinessChecklistProps) {
  const isLoading = stats.pagesLoaded < stats.pagesExpected;

  const todoCount =
    (stats.counts["TODO"] ?? stats.counts["NOT RUN"] ?? 0) + (stats.counts["EXECUTING"] ?? 0);
  const failCount =
    (stats.counts["FAIL"] ?? stats.counts["FAILED"] ?? 0) + (stats.counts["BLOCKED"] ?? 0);
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
      label: "Has at least one execution",
      detail:
        executions.length === 0
          ? "No test executions linked to this version"
          : `${executions.length} execution${executions.length !== 1 ? "s" : ""} linked`,
      pass: executions.length > 0,
    },
    {
      label: "All tests executed",
      detail: isLoading
        ? "Still loading test results…"
        : todoCount === 0
          ? "No pending or in-progress tests"
          : `${todoCount} test${todoCount !== 1 ? "s" : ""} not yet executed`,
      pass: !isLoading && todoCount === 0 && stats.total > 0,
      loading: isLoading,
    },
    {
      label: "No failures or blockers",
      detail: isLoading
        ? "Still loading test results…"
        : failCount === 0
          ? "All executed tests passed"
          : `${failCount} failure${failCount !== 1 ? "s" : ""} or blocked test${failCount !== 1 ? "s" : ""}`,
      pass: !isLoading && failCount === 0 && stats.total > 0,
      loading: isLoading,
    },
    {
      label: "No open critical bugs",
      detail:
        criticalBugCount === 0
          ? "No unresolved critical or blocker bugs"
          : `${criticalBugCount} unresolved critical/blocker bug${criticalBugCount !== 1 ? "s" : ""}`,
      pass: criticalBugCount === 0,
    },
    {
      label: "Stories in acceptance or done",
      detail:
        storiesTotal === 0
          ? "No issues linked to this version"
          : storiesDone === storiesTotal
            ? `All ${storiesTotal} issues done or in acceptance`
            : `${storiesDone} / ${storiesTotal} issues done or in acceptance`,
      pass: storiesTotal > 0 && storiesDone === storiesTotal,
    },
  ];

  const passCount = items.filter((i) => i.pass).length;
  const allPassing = passCount === items.length;
  const isReleased = version.released === true;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-slate-500 dark:text-slate-400" />
          <h3 className="font-semibold text-slate-800 dark:text-slate-200">Release readiness</h3>
        </div>
        <div className="flex items-center gap-2">
          {isReleased && (
            <span className="rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300">
              Released
            </span>
          )}
          <span
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs font-semibold",
              allPassing
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
            )}
          >
            {allPassing ? "Ready to release" : `${passCount} / ${items.length} criteria met`}
          </span>
        </div>
      </div>

      <ul className="divide-y divide-slate-100 dark:divide-slate-700">
        {items.map((item) => (
          <li key={item.label} className="flex items-start gap-3 px-5 py-3">
            <span className="mt-0.5 shrink-0">
              {item.loading ? (
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              ) : item.pass ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
            </span>
            <div className="min-w-0">
              <p
                className={cn(
                  "text-sm font-medium",
                  item.pass
                    ? "text-slate-800 dark:text-slate-200"
                    : "text-slate-700 dark:text-slate-300",
                )}
              >
                {item.label}
              </p>
              <p
                className={cn(
                  "text-xs",
                  item.loading
                    ? "text-slate-400"
                    : item.pass
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400",
                )}
              >
                {item.detail}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
