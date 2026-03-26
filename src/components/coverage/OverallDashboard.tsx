import { useMemo } from "react";
import { TrendingUp } from "lucide-react";
import { cn } from "@/components/ui/utils";
import { DonutChart, StatCard, StackedBar } from "@/components/charts/StatusCharts";
import { buildSlicesFromTests } from "@/components/charts/status-utils";
import type { XrayTestWithStatus } from "@/types";
import { MetricTile, CoverageTile } from "./MetricTile";
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

  // Derived metrics
  const passedSlice = slices.find((s) => s.key === "PASS");
  const failedSlice = slices.find((s) => s.key === "FAIL");
  const overallPassRate = total > 0 && passedSlice ? passedSlice.pct : null;

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
  // Using is_final is more robust than name-matching custom Xray statuses.
  const neverRunCount = useMemo(
    () => allTests.filter((t) => t.latest_status?.is_final !== true).length,
    [allTests],
  );

  const runAtLeastOnce = total - neverRunCount;
  const coveragePct = total > 0 ? Math.round((runAtLeastOnce / total) * 100) : 0;

  const healthLabel =
    total === 0
      ? "No data"
      : overallPassRate === 1
        ? "All passing"
        : overallPassRate !== null
          ? `${Math.round(overallPassRate * 100)}% passing`
          : "—";

  const healthColor =
    total === 0
      ? "text-slate-400 bg-slate-50 border-slate-200 dark:text-slate-400 dark:bg-slate-800/50 dark:border-slate-600"
      : overallPassRate === 1
        ? "text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-900/40 dark:border-emerald-800"
        : overallPassRate !== null && overallPassRate >= 0.8
          ? "text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-900/40 dark:border-blue-800"
          : failedSlice && failedSlice.count > 0
            ? "text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-900/40 dark:border-red-800"
            : "text-slate-500 bg-slate-50 border-slate-200 dark:text-slate-400 dark:bg-slate-800/50 dark:border-slate-600";

  if (total === 0) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Overall coverage
          </p>
          <h2 className="mt-0.5 text-lg font-bold text-slate-900 dark:text-slate-100">
            {selectedCount} set{selectedCount !== 1 ? "s" : ""} selected
          </h2>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full border px-3 py-1 text-xs font-semibold",
            healthColor,
          )}
        >
          {healthLabel}
        </span>
      </div>

      <div className="space-y-5">
        {total > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-5">
              <DonutChart slices={slices} total={total} label="tests" />
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
              <p className="mb-2 text-xs font-medium text-slate-400">Status distribution</p>
              <StackedBar slices={slices} />
            </div>
          </>
        )}

        {/* ── Smarter metrics grid ── */}
        <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 dark:border-slate-700 sm:grid-cols-4">
          <MetricTile
            label="Test sets"
            value={String(selectedCount)}
            sub="selected"
            color="slate"
          />
          <MetricTile
            label="Total tests"
            value={String(total)}
            sub="across all sets"
            color="slate"
          />
          <MetricTile
            label="Sets with failures"
            value={String(setsWithFailures)}
            sub={`of ${selectedCount} set${selectedCount !== 1 ? "s" : ""}`}
            color={setsWithFailures > 0 ? "red" : "slate"}
          />
          <MetricTile
            label="Sets fully passing"
            value={String(setsFullyPassing)}
            sub={`of ${selectedCount} set${selectedCount !== 1 ? "s" : ""}`}
            color={setsFullyPassing === selectedCount && selectedCount > 0 ? "emerald" : "slate"}
          />
        </div>

        {/* ── Coverage completeness (trend/history) ── */}
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
          <div className="mb-3 flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-slate-400" />
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Coverage completeness
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <CoverageTile
              label="Run at least once"
              value={runAtLeastOnce}
              total={total}
              color="emerald"
            />
            <CoverageTile
              label="Not yet run"
              value={neverRunCount}
              total={total}
              color={neverRunCount > 0 ? "amber" : "slate"}
            />
            <CoverageTile
              label="Currently failing"
              value={failedSlice?.count ?? 0}
              total={total}
              color={(failedSlice?.count ?? 0) > 0 ? "red" : "slate"}
            />
          </div>
          {/* Coverage progress bar */}
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-[10px] text-slate-400">
              <span>Coverage</span>
              <span className="font-semibold text-slate-600 dark:text-slate-300">
                {coveragePct}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-700",
                  coveragePct === 100
                    ? "bg-emerald-500"
                    : coveragePct >= 80
                      ? "bg-blue-500"
                      : coveragePct >= 50
                        ? "bg-amber-400"
                        : "bg-slate-400",
                )}
                style={{ width: `${coveragePct}%` }}
              />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
