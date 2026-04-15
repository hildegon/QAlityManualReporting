import { useMemo, useState } from "react";
import { DonutChart, StatCard } from "@/components/charts/StatusCharts";
import { buildSlicesFromCounts } from "@/components/charts/status-utils";
import { useIssueLinkTypes } from "@/services/queries";
import type { useVersionRunStats } from "@/services/queries";
import { cn } from "@/components/ui/utils";
import { ChevronDown } from "lucide-react";
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
          <div className="flex flex-wrap items-center gap-4">
            <DonutChart slices={slices} total={stats.total} isLoading={isLoading} />
            <div
              className="grid flex-1 gap-2"
              style={{
                gridTemplateColumns: `repeat(${Math.min(slices.length, 3)}, minmax(0, 1fr))`,
                minWidth: 180,
              }}
            >
              {slices.map((sl) => (
                <StatCard key={sl.key} sl={sl} />
              ))}
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
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Failed tests ({isLoading ? "…" : failedCount})
            </span>
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
