import { useMemo, useState } from "react";
import { DonutChart, MiniStackedBar } from "@/components/charts/StatusCharts";
import { buildSlicesFromCounts } from "@/components/charts/status-utils";
import { useIssueLinkTypes } from "@/services/queries";
import type { useVersionRunStats } from "@/services/queries";
import { cn } from "@/components/ui/utils";
import { AlertTriangle, CheckCircle2, ChevronDown, Clock3 } from "lucide-react";
import { FetchProgress } from "./FetchProgress";
import { FailedTestsAnalysis } from "./FailedTestsAnalysis";
import type { JiraBug, JiraVersion, TestExecution } from "@/types";

interface VersionDashboardProps {
  stats: ReturnType<typeof useVersionRunStats>;
  executions: TestExecution[];
  version: JiraVersion;
  projectKey: string;
  bugs: JiraBug[];
}

export function VersionDashboard({ stats, executions, version, projectKey, bugs }: VersionDashboardProps) {
  const { data: linkTypes } = useIssueLinkTypes();
  const linkTypeName = useMemo(() => {
    const match = linkTypes?.find((lt) => /test/i.test(lt.name));
    return match?.name ?? "Test";
  }, [linkTypes]);

  const slices = useMemo(() => buildSlicesFromCounts(stats.counts, stats.total), [stats]);
  const [failedOpen, setFailedOpen] = useState(false);

  const isLoading = stats.pagesLoaded < stats.pagesExpected;
  const failedCount = stats.failedTests.length;
  const passCount = stats.counts["PASS"] ?? stats.counts["PASSED"] ?? 0;
  const blockedCount = stats.counts["BLOCKED"] ?? 0;
  const hardFailCount = stats.counts["FAIL"] ?? stats.counts["FAILED"] ?? 0;
  const failCount = hardFailCount + blockedCount;
  const todoCount = (stats.counts["TODO"] ?? 0) + (stats.counts["NOT RUN"] ?? 0);
  const executingCount = stats.counts["EXECUTING"] ?? 0;
  const unresolvedRunCount = todoCount + executingCount;
  const executedCount = Math.max(0, stats.total - unresolvedRunCount);
  const passRate = stats.total > 0 ? Math.round((passCount / stats.total) * 100) : null;
  const executionRate = stats.total > 0 ? Math.round((executedCount / stats.total) * 100) : null;
  const notRunRate = stats.total > 0 ? Math.round((todoCount / stats.total) * 100) : null;
  const hasNotRunWarning = (notRunRate ?? 0) > 10;
  const failureClasses = stats.failedTests.reduce<Record<string, number>>((acc, test) => {
    acc[test.classification] = (acc[test.classification] ?? 0) + 1;
    return acc;
  }, {});
  const failureTypes = stats.failedTests.reduce<Record<string, number>>((acc, test) => {
    acc[test.testType] = (acc[test.testType] ?? 0) + 1;
    return acc;
  }, {});
  const manualFailedCount = failureTypes.manual ?? 0;
  const cucumberFailedCount = failureTypes.cucumber ?? 0;
  const genericFailedCount = failureTypes.generic ?? 0;
  const unknownFailedCount = failureTypes.unknown ?? 0;

  const releaseTone = isLoading
    ? "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40"
    : stats.total === 0
      ? "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40"
      : failCount === 0 && unresolvedRunCount === 0
        ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40"
      : failCount > 0
          ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/40"
          : hasNotRunWarning
            ? "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40"
          : "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40";
  const releaseSignal = isLoading
    ? "Loading test execution results…"
    : stats.total === 0
      ? "No test runs available for this version yet."
      : failCount === 0 && unresolvedRunCount === 0
        ? `All ${stats.total} test runs are executed and passing.`
        : failCount > 0
          ? manualFailedCount > 0
            ? `${manualFailedCount} manual ${manualFailedCount === 1 ? "test needs" : "tests need"} review first.`
            : `${failedCount} ${failedCount === 1 ? "test needs" : "tests need"} review across linked executions.`
          : hasNotRunWarning
            ? `${todoCount} ${todoCount === 1 ? "test is" : "tests are"} still not run (${notRunRate}%).`
          : `${unresolvedRunCount} ${unresolvedRunCount === 1 ? "test run is" : "test runs are"} still pending execution.`;
  const failureSummary = [
    manualFailedCount ? `${manualFailedCount} manual first` : null,
    cucumberFailedCount ? `${cucumberFailedCount} cucumber` : null,
    genericFailedCount ? `${genericFailedCount} generic` : null,
    unknownFailedCount ? `${unknownFailedCount} unknown type` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const failureClassificationSummary = [
    failureClasses.failing ? `${failureClasses.failing} still failing` : null,
    failureClasses.flaky ? `${failureClasses.flaky} flaky` : null,
    failureClasses["never-passed"] ? `${failureClasses["never-passed"]} no pass yet` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  if (executions.length === 0) return null;

  return (
    <div id="version-section-results" className="mt-4 space-y-2">
      {/* Compact test results card */}
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Test results
        </div>
        <FetchProgress loaded={stats.pagesLoaded} expected={stats.pagesExpected} />

        {stats.total > 0 ? (
          <div className="space-y-3">
            <div className={cn("rounded-xl border px-3 py-2", releaseTone)}>
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                Release signal
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                {releaseSignal}
              </div>
            </div>

            <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
              <div className="flex shrink-0 items-center gap-4">
                <DonutChart slices={slices} total={stats.total} isLoading={isLoading} />
                <div className="min-w-[120px]">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                    Pass rate
                  </div>
                  <div className="mt-1 text-3xl font-bold leading-none text-slate-900 dark:text-slate-50">
                    {passRate === null ? "—" : `${passRate}%`}
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {passCount} / {stats.total} passing
                  </div>
                  <MiniStackedBar slices={slices} className="mt-2 max-w-32" />
                </div>
              </div>

              <div className="grid flex-1 gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-900/40">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                    <Clock3 className="h-3.5 w-3.5" />
                    Execution coverage
                  </div>
                  <div className="mt-1 text-2xl font-bold leading-none text-slate-900 dark:text-slate-50">
                    {executionRate === null ? "—" : `${executionRate}%`}
                  </div>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    {executedCount} executed · {unresolvedRunCount} pending
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                    {todoCount > 0 && (
                      <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 font-medium text-slate-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300">
                        {todoCount} not run
                      </span>
                    )}
                    {executingCount > 0 && (
                      <span className="rounded-full border border-yellow-200 bg-yellow-50 px-2 py-0.5 font-medium text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-300">
                        {executingCount} executing
                      </span>
                    )}
                    {executedCount > 0 && (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        {executedCount} complete
                      </span>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-900/40">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                    {failCount === 0 ? (
                      hasNotRunWarning ? (
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      )
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                    )}
                    Result mix
                  </div>
                  <div className="mt-1 text-2xl font-bold leading-none text-slate-900 dark:text-slate-50">
                    {failCount > 0
                      ? `${failCount} failing / blocked`
                      : hasNotRunWarning
                        ? `${notRunRate}% not run`
                        : "Clean run"}
                  </div>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    {failedCount > 0
                      ? failureSummary || failureClassificationSummary || `${failedCount} failures to review`
                      : hasNotRunWarning
                        ? `${todoCount} ${todoCount === 1 ? "test remains" : "tests remain"} not run, above the 10% warning threshold`
                      : "No failing tests right now"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                    {hasNotRunWarning && (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                        Warning: {notRunRate}% not run
                      </span>
                    )}
                    {failureSummary && (
                      <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 font-medium text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300">
                        {failureSummary}
                      </span>
                    )}
                    {slices.map((sl) => (
                      <span
                        key={sl.key}
                        className={cn(
                          "rounded-full border px-2 py-0.5 font-medium",
                          sl.lightBg,
                          sl.darkLightBg,
                          sl.borderClass,
                          sl.textClass,
                        )}
                      >
                        {sl.count} {sl.label.toLowerCase()}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          !isLoading && (
            <p className="py-1 text-sm text-slate-400">No test runs yet.</p>
          )
        )}
      </div>

      {/* Failed tests — collapsible */}
      {failedCount > 0 && (
        <div id="version-section-failures" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <button
            onClick={() => setFailedOpen((o) => !o)}
            className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50"
          >
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Failure review ({isLoading ? "…" : failedCount})
              </span>
              {!isLoading && (failureSummary || failureClassificationSummary) && (
                <p className="mt-0.5 text-xs text-slate-400">
                  {failureSummary || failureClassificationSummary}
                </p>
              )}
            </div>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 text-slate-400 transition-transform",
                failedOpen && "rotate-180",
              )}
            />
          </button>

          {failedOpen && (
            <div className="border-t border-slate-100 dark:border-slate-700">
              <FailedTestsAnalysis
                failedTests={stats.failedTests}
                isLoading={isLoading}
                linkableBugs={bugs}
                linkTypeName={linkTypeName}
                projectKey={projectKey}
                versionName={version.name}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
