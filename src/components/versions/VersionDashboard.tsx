import { useMemo } from "react";
import {
  DonutChart,
  StatCard,
  StackedBar,
  buildSlicesFromCounts,
} from "@/components/charts/StatusCharts";
import { useIssueLinkTypes } from "@/services/queries";
import type { useVersionRunStats } from "@/services/queries";
import { cn } from "@/components/ui/utils";
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

  const isLoading = stats.pagesLoaded < stats.pagesExpected;
  const passedSlice = slices.find((s) => s.key === "PASS");
  const failedSlice = slices.find((s) => s.key === "FAIL");
  const passRate = stats.total > 0 && passedSlice ? passedSlice.pct : null;

  const healthLabel =
    stats.total === 0
      ? "No test runs"
      : passRate === null
        ? "—"
        : passRate === 1
          ? "All passing"
          : `${Math.round(passRate * 100)}% passing`;

  const healthColor =
    stats.total === 0
      ? "text-slate-400 bg-slate-50 border-slate-200"
      : passRate === 1
        ? "text-emerald-600 bg-emerald-50 border-emerald-200"
        : passRate !== null && passRate >= 0.8
          ? "text-blue-600 bg-blue-50 border-blue-200"
          : failedSlice && failedSlice.count > 0
            ? "text-red-600 bg-red-50 border-red-200"
            : "text-slate-500 bg-slate-50 border-slate-200";

  return (
    <div id="version-section-results" className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Test results report
            </p>
            <h2 className="mt-0.5 text-lg font-bold text-slate-900 dark:text-slate-100">
              {version.name}
            </h2>
            {version.description && (
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                {version.description}
              </p>
            )}
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-xs font-semibold",
              healthColor,
            )}
          >
            {isLoading ? "Loading…" : healthLabel}
          </span>
        </div>

        {executions.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">
            No executions linked to this version yet.
          </p>
        ) : (
          <div className="space-y-5">
            <FetchProgress loaded={stats.pagesLoaded} expected={stats.pagesExpected} />

            {stats.total > 0 && (
              <>
                <div className="flex flex-wrap items-center gap-5">
                  <DonutChart slices={slices} total={stats.total} isLoading={isLoading} />
                  <div
                    className="grid flex-1 gap-2"
                    style={{
                      gridTemplateColumns: `repeat(${Math.min(slices.length, 3)}, minmax(0, 1fr))`,
                      minWidth: 220,
                    }}
                  >
                    {slices.map((sl) => (
                      <StatCard key={sl.key} sl={sl} />
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium text-slate-400">Result distribution</p>
                  <StackedBar slices={slices} />
                </div>
              </>
            )}

            <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-400 dark:border-slate-700 dark:text-slate-500">
              {version.release_date && (
                <span>
                  Release date:{" "}
                  <span className="font-medium text-slate-600 dark:text-slate-300">
                    {version.release_date}
                  </span>
                </span>
              )}
              <span>
                Executions:{" "}
                <span className="font-medium text-slate-600 dark:text-slate-300">
                  {executions.length}
                </span>
              </span>
              <span>
                Total runs:{" "}
                <span className="font-medium text-slate-600 dark:text-slate-300">
                  {isLoading ? "…" : stats.total}
                </span>
              </span>
            </div>
          </div>
        )}
      </div>

      {executions.length > 0 && (
        <div id="version-section-failures">
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
  );
}
