import { memo, useState, useMemo, useRef, useEffect } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Clock,
  Layers,
} from "lucide-react";
import { cn } from "@/components/ui/utils";
import { Spinner } from "@/components/ui/spinner";
import { DonutChart, StatCard, StackedBar, MiniStackedBar } from "@/components/charts/StatusCharts";
import { buildSlicesFromTests, findSlice } from "@/components/charts/status-utils";
import { parseRateLimitError } from "@/stores/uiStore";
import {
  normalizeStatusKey,
  STATUS_PASS,
  STATUS_FAIL,
  STATUS_BLOCKED,
  STATUS_NA,
} from "@/constants/statuses";
import type { XrayTestSet, XrayTestWithStatus } from "@/types";
import { StatusBadge } from "./StatusBadge";
import { passRate, hasFail } from "./utils";

/** Hover border + background tint based on test status. */
function statusHoverClasses(statusName: string | undefined): string {
  const key = normalizeStatusKey(statusName ?? "TODO");
  switch (key) {
    case STATUS_PASS:
      return "hover:border-emerald-400 hover:bg-emerald-50 dark:hover:border-emerald-500 dark:hover:bg-emerald-900/30";
    case STATUS_FAIL:
      return "hover:border-red-400 hover:bg-red-50 dark:hover:border-red-500 dark:hover:bg-red-900/30";
    case STATUS_NA:
      return "hover:border-amber-400 hover:bg-amber-50 dark:hover:border-amber-500 dark:hover:bg-amber-900/30";
    case STATUS_BLOCKED:
      return "hover:border-blue-400 hover:bg-blue-50 dark:hover:border-blue-500 dark:hover:bg-blue-900/30";
    default: // TODO / NOT RUN / unknown
      return "hover:border-slate-400 hover:bg-slate-100 dark:hover:border-slate-500 dark:hover:bg-slate-700/50";
  }
}

export type SortBy = "key" | "name" | "status";
export type SortDir = "asc" | "desc";

interface SortIconProps {
  col: SortBy;
  sortBy: SortBy;
  sortDir: SortDir;
}

function SortIcon({ col, sortBy, sortDir }: SortIconProps) {
  if (sortBy !== col) return <ArrowUpDown className="h-3 w-3 text-slate-300" />;
  return sortDir === "asc" ? (
    <ArrowUp className="h-3 w-3 text-slate-500" />
  ) : (
    <ArrowDown className="h-3 w-3 text-slate-500" />
  );
}

export interface TestSetSectionProps {
  testSet: XrayTestSet;
  tests: XrayTestWithStatus[] | undefined;
  isLoading: boolean;
  isFetching?: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  testSearch: string;
  statusFilter: string | null;
  expandSignal: number;
  collapseSignal: number;
  onTestClick?: (test: XrayTestWithStatus) => void;
}

export const TestSetSection = memo(function TestSetSection({
  testSet,
  tests,
  isLoading,
  isFetching,
  isError,
  error,
  onRetry,
  testSearch,
  statusFilter,
  expandSignal,
  collapseSignal,
  onTestClick,
}: TestSetSectionProps) {
  const [collapsed, setCollapsed] = useState(true);
  const lastExpandSignal = useRef(0);
  const lastCollapseSignal = useRef(0);
  useEffect(() => {
    if (expandSignal !== lastExpandSignal.current) {
      lastExpandSignal.current = expandSignal;
      setCollapsed(false);
    }
  }, [expandSignal]);
  useEffect(() => {
    if (collapseSignal !== lastCollapseSignal.current) {
      lastCollapseSignal.current = collapseSignal;
      setCollapsed(true);
    }
  }, [collapseSignal]);
  const [sortBy, setSortBy] = useState<SortBy>("key");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const rateLimitUntil = isError ? parseRateLimitError(error) : null;
  const errorMessage = isError ? (error instanceof Error ? error.message : String(error)) : null;

  const slices = useMemo(() => buildSlicesFromTests(tests ?? []), [tests]);

  const rate = tests ? passRate(tests) : null;
  const rateLabel = rate === null ? null : `${Math.round(rate * 100)}%`;
  const rateColor =
    rate === null
      ? ""
      : rate === 1
        ? "text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-900/40 dark:border-emerald-800"
        : rate >= 0.8
          ? "text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-900/40 dark:border-blue-800"
          : hasFail(tests ?? [])
            ? "text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-900/40 dark:border-red-800"
            : "text-slate-500 bg-slate-50 border-slate-200 dark:text-slate-400 dark:bg-slate-800/50 dark:border-slate-600";

  // Coverage = tests that have been run at least once.
  // A test is "not yet run" when its status is absent or not a final status.
  // Using is_final is more robust than name-matching, as it handles custom Xray status names.
  const notRunCount = tests ? tests.filter((t) => t.latest_status?.is_final !== true).length : null;
  const covPct =
    tests && tests.length > 0
      ? Math.round(((tests.length - (notRunCount ?? 0)) / tests.length) * 100)
      : null;
  const covLabel = covPct !== null ? `${covPct}% run` : null;
  const covColor =
    covPct === null
      ? ""
      : covPct === 100
        ? "text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-900/40 dark:border-emerald-800"
        : covPct >= 80
          ? "text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-900/40 dark:border-blue-800"
          : covPct >= 40
            ? "text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-900/40 dark:border-amber-800"
            : "text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-900/40 dark:border-red-800";

  const handleSort = (col: SortBy) => {
    if (sortBy === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir("asc");
    }
  };

  const filtered = useMemo(() => {
    if (!tests) return [];
    let result = tests;

    // Text search
    const q = testSearch.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (t) => t.jira.key.toLowerCase().includes(q) || t.jira.summary.toLowerCase().includes(q),
      );
    }

    // Status filter
    if (statusFilter) {
      result = result.filter((t) => {
        const name = t.latest_status?.name ?? "TODO";
        return findSlice(name).key === statusFilter;
      });
    }

    // Sort
    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "key") {
        cmp = a.jira.key.localeCompare(b.jira.key, undefined, { numeric: true });
      } else if (sortBy === "name") {
        cmp = a.jira.summary.localeCompare(b.jira.summary);
      } else {
        // status: sort by palette order
        const aKey = findSlice(a.latest_status?.name ?? "TODO").key;
        const bKey = findSlice(b.latest_status?.name ?? "TODO").key;
        cmp = aKey.localeCompare(bKey);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [tests, testSearch, statusFilter, sortBy, sortDir]);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
      {/* Section header */}
      <button
        className="flex w-full items-center gap-3 bg-slate-50 px-4 py-3 text-left hover:bg-slate-100 dark:bg-slate-700/50 dark:hover:bg-slate-700"
        onClick={() => setCollapsed((c) => !c)}
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
        )}
        <Layers className="h-4 w-4 shrink-0 text-slate-400" />
        <span className="w-24 shrink-0 font-mono text-xs text-slate-500 dark:text-slate-400">
          {testSet.jira.key}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700 dark:text-slate-200">
          {testSet.jira.summary}
        </span>

        {/* Right-side summary — only show when data is loaded */}
        {isLoading && <Spinner size="sm" />}
        {!isLoading && isFetching && (
          <span className="flex items-center gap-1 text-[10px] text-blue-500 dark:text-blue-400">
            <Spinner size="sm" />
            Refreshing…
          </span>
        )}
        {!isLoading && !isError && tests && (
          <div className="flex shrink-0 items-center gap-2">
            {/* Stacked colour bar */}
            {slices.length > 0 && <MiniStackedBar slices={slices} className="w-28" />}

            {/* Test count */}
            <span className="w-14 text-right text-xs text-slate-400">
              {tests.length} test{tests.length !== 1 ? "s" : ""}
            </span>

            {/* Coverage pill */}
            {covLabel && (
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                  covColor,
                )}
              >
                {covLabel}
              </span>
            )}

            {/* Pass-rate pill */}
            {rateLabel && (
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                  rateColor,
                )}
              >
                {rateLabel} pass
              </span>
            )}
          </div>
        )}
      </button>

      {/* Dashboard + test rows */}
      {!collapsed && (
        <div>
          {/* Per-set dashboard strip */}
          {!isLoading && !isError && tests && tests.length > 0 && (
            <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-700">
              <div className="flex flex-wrap items-center gap-5">
                <DonutChart slices={slices} total={tests.length} label="tests" />
                <div className="flex-1 space-y-3" style={{ minWidth: 200 }}>
                  <div
                    className="grid gap-2"
                    style={{
                      gridTemplateColumns: `repeat(${Math.min(slices.length, 3)}, minmax(0, 1fr))`,
                    }}
                  >
                    {slices.map((sl) => (
                      <StatCard key={sl.key} sl={sl} />
                    ))}
                  </div>
                  <StackedBar slices={slices} />
                  {/* Coverage completeness row */}
                  {notRunCount !== null && (
                    <div className="space-y-1 pt-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-500 dark:text-slate-400">
                          Coverage
                        </span>
                        <span
                          className={cn(
                            "font-semibold",
                            covPct === 100
                              ? "text-emerald-600 dark:text-emerald-400"
                              : notRunCount > 0
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-slate-500 dark:text-slate-400",
                          )}
                        >
                          {tests.length - notRunCount} / {tests.length} run ({covPct}%)
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            covPct === 100
                              ? "bg-emerald-500"
                              : notRunCount > 0
                                ? "bg-amber-400"
                                : "bg-slate-400",
                          )}
                          style={{ width: `${covPct}%` }}
                        />
                      </div>
                      {notRunCount > 0 && (
                        <p className="text-[10px] text-amber-600 dark:text-amber-400">
                          {notRunCount} test{notRunCount !== 1 ? "s" : ""} not yet run
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Sort controls */}
          {!isLoading && !isError && tests && tests.length > 0 && (
            <div className="flex items-center gap-1 border-b border-slate-100 bg-slate-50/50 px-4 py-1.5 dark:border-slate-700 dark:bg-slate-700/20">
              <span className="mr-1 text-[10px] text-slate-400">Sort:</span>
              {(["key", "name", "status"] as SortBy[]).map((col) => (
                <button
                  key={col}
                  onClick={() => handleSort(col)}
                  className={cn(
                    "flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium transition-colors",
                    sortBy === col
                      ? "bg-slate-200 text-slate-700 dark:bg-slate-600 dark:text-slate-200"
                      : "text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700",
                  )}
                >
                  {col.charAt(0).toUpperCase() + col.slice(1)}
                  <SortIcon col={col} sortBy={sortBy} sortDir={sortDir} />
                </button>
              ))}
              {statusFilter && (
                <span className="ml-2 text-[10px] italic text-slate-400">Filtered by status</span>
              )}
            </div>
          )}

          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {isLoading && (
              <div className="flex items-center gap-2 px-4 py-3 text-sm text-slate-400">
                <Spinner size="sm" />
                Loading tests…
              </div>
            )}
            {isError && (
              <div className="flex items-start gap-2 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                {rateLimitUntil !== null ? (
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <div className="flex-1">
                  {rateLimitUntil !== null ? (
                    <span className="text-amber-700 dark:text-amber-400">
                      Rate limited — please wait before retrying.
                    </span>
                  ) : (
                    <span>{errorMessage ?? "Failed to load tests for this set."}</span>
                  )}
                </div>
                <button
                  className="shrink-0 rounded px-2 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30"
                  onClick={onRetry}
                >
                  Retry
                </button>
              </div>
            )}
            {!isLoading && !isError && filtered.length === 0 && (
              <p className="px-4 py-3 text-sm italic text-slate-400">
                {testSearch.trim() || statusFilter
                  ? "No tests match the current filter."
                  : "This test set has no tests."}
              </p>
            )}
            {!isLoading &&
              !isError &&
              filtered.map((test) => (
                <div
                  key={test.issue_id}
                  role={onTestClick ? "button" : undefined}
                  tabIndex={onTestClick ? 0 : undefined}
                  className={cn(
                    "mx-3 my-1 flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 transition-colors dark:border-slate-700 dark:bg-slate-800",
                    onTestClick &&
                      cn("cursor-pointer", statusHoverClasses(test.latest_status?.name)),
                  )}
                  onClick={() => onTestClick?.(test)}
                  onKeyDown={(e) => e.key === "Enter" && onTestClick?.(test)}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-slate-800 dark:text-slate-200">
                      {test.jira.summary}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-slate-400">
                      {test.jira.key}
                    </p>
                  </div>
                  <StatusBadge
                    name={test.latest_status?.name ?? "NOT RUN"}
                    {...(test.latest_status?.color !== undefined
                      ? { color: test.latest_status.color }
                      : {})}
                  />
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
});
