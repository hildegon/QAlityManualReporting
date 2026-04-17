import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, Clock3 } from "lucide-react";
import { cn } from "@/components/ui/utils";
import { DonutChart, MiniStackedBar } from "@/components/charts/StatusCharts";
import { buildSlicesFromTests } from "@/components/charts/status-utils";
import type { XrayTestWithStatus } from "@/types";
import { type SetQueryMap, passRate, hasFail } from "./utils";

export interface OverallDashboardProps {
  allTests: XrayTestWithStatus[];
  selectedCount: number;
  queryBySetId: SetQueryMap;
}

export function OverallDashboard({
  allTests,
  selectedCount,
  queryBySetId,
}: OverallDashboardProps) {
  const slices = useMemo(() => buildSlicesFromTests(allTests), [allTests]);
  const total = allTests.length;

  const passedSlice = slices.find((s) => s.key === "PASS");
  const failedSlice = slices.find((s) => s.key === "FAIL");
  const passCount = passedSlice?.count ?? 0;
  const failCount = failedSlice?.count ?? 0;
  const overallPassRate = total > 0 ? passCount / total : null;

  const setsWithFailures = useMemo(() => {
    let count = 0;
    for (const { tests } of queryBySetId.values()) {
      if (tests && hasFail(tests)) count++;
    }
    return count;
  }, [queryBySetId]);

  const setsFullyPassing = useMemo(() => {
    let count = 0;
    for (const { tests } of queryBySetId.values()) {
      if (tests && tests.length > 0 && passRate(tests) === 1) count++;
    }
    return count;
  }, [queryBySetId]);

  // "Not run" = status absent or not a final status (is_final !== true).
  const neverRunCount = useMemo(
    () => allTests.filter((t) => t.latest_status?.is_final !== true).length,
    [allTests],
  );

  const runAtLeastOnce = total - neverRunCount;
  const coveragePct = total > 0 ? Math.round((runAtLeastOnce / total) * 100) : 0;
  const notRunPct = total > 0 ? Math.round((neverRunCount / total) * 100) : 0;
  const hasNotRunWarning = notRunPct > 10;

  // Coverage signal banner — mirrors the release signal on the Versions page.
  const signalBg =
    total === 0
      ? "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40"
      : failCount > 0
        ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/40"
        : hasNotRunWarning
          ? "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40"
          : overallPassRate === 1 && neverRunCount === 0
            ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40"
            : "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40";

  const signalText =
    total === 0
      ? "No tests loaded for the selected sets."
      : failCount > 0
        ? `${failCount} test${failCount !== 1 ? "s" : ""} failing across ${setsWithFailures} set${setsWithFailures !== 1 ? "s" : ""} — review required.`
        : hasNotRunWarning
          ? `${neverRunCount} test${neverRunCount !== 1 ? "s" : ""} not yet run (${notRunPct}%) — coverage gap.`
          : overallPassRate === 1 && neverRunCount === 0
            ? `All ${total} tests run and passing across ${selectedCount} set${selectedCount !== 1 ? "s" : ""}.`
            : `${Math.round((overallPassRate ?? 0) * 100)}% pass rate — ${runAtLeastOnce} of ${total} tests run.`;

  if (total === 0) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        Coverage summary
      </div>

      {/* Coverage signal */}
      <div className={cn("mb-3 rounded-xl border px-3 py-2", signalBg)}>
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
          Coverage signal
        </div>
        <div className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
          {signalText}
        </div>
      </div>

      {/* Chart + metric tiles */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
        {/* Donut + pass rate */}
        <div className="flex shrink-0 items-center gap-4">
          <DonutChart slices={slices} total={total} label="tests" />
          <div className="min-w-[120px]">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
              Pass rate
            </div>
            <div className="mt-1 text-3xl font-bold leading-none text-slate-900 dark:text-slate-50">
              {overallPassRate === null ? "—" : `${Math.round(overallPassRate * 100)}%`}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {passCount} / {total} passing
            </div>
            <MiniStackedBar slices={slices} className="mt-2 max-w-32" />
          </div>
        </div>

        {/* 2-col metric tiles */}
        <div className="grid flex-1 gap-3 md:grid-cols-2">
          {/* Test coverage tile */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-900/40">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
              <Clock3 className="h-3.5 w-3.5" />
              Test coverage
            </div>
            <div className="mt-1 text-2xl font-bold leading-none text-slate-900 dark:text-slate-50">
              {coveragePct}%
            </div>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
              {runAtLeastOnce} run · {neverRunCount} not yet run
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                {runAtLeastOnce} run
              </span>
              {neverRunCount > 0 && (
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 font-medium",
                    hasNotRunWarning
                      ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
                      : "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300",
                  )}
                >
                  {neverRunCount} not run
                </span>
              )}
            </div>
          </div>

          {/* Set health tile */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-900/40">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
              {setsWithFailures > 0 ? (
                <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              )}
              Set health
            </div>
            <div className="mt-1 text-2xl font-bold leading-none text-slate-900 dark:text-slate-50">
              {setsWithFailures > 0
                ? `${setsWithFailures} with failures`
                : `All ${selectedCount} passing`}
            </div>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
              {setsFullyPassing} fully passing · {selectedCount - setsFullyPassing} partial or
              pending
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
              {setsFullyPassing > 0 && (
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  {setsFullyPassing} clean
                </span>
              )}
              {setsWithFailures > 0 && (
                <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 font-medium text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
                  {setsWithFailures} failing
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
