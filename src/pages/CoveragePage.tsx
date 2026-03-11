import { memo, useState, useMemo, useRef, useEffect } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { useGetTestSets, queryKeys } from "@/services/queries";
import { useContentProjectKey } from "@/hooks/useProjectKey";
import { parseRateLimitError } from "@/stores/uiStore";
import { useCoveragePresetsStore } from "@/stores/coveragePresetsStore";
import type { CoveragePreset } from "@/stores/coveragePresetsStore";
import { useCoverageHistoryStore, buildViewKey } from "@/stores/coverageHistoryStore";
import type { CoverageSnapshot } from "@/stores/coverageHistoryStore";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BookmarkCheck,
  BookmarkPlus,
  CheckSquare2,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  Layers,
  Pencil,
  RefreshCw,
  Search,
  Square,
  Trash2,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { cn } from "@/components/ui/utils";
import { EmptyState } from "@/components/common/EmptyState";
import type { XrayTestSet, XrayTestWithStatus } from "@/types";
import * as api from "@/services/tauri";
import {
  DonutChart,
  StatCard,
  StackedBar,
  MiniStackedBar,
  buildSlicesFromTests,
  findSlice,
} from "@/components/charts/StatusCharts";
import type { Slice } from "@/components/charts/StatusCharts";

// ── CSV builder ───────────────────────────────────────────────────────────────

function escapeCsvCell(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function buildCoverageCSV(
  sets: XrayTestSet[],
  queryBySetId: Map<string, { tests: XrayTestWithStatus[] | undefined }>,
): string {
  const header = ["Set Key", "Set Name", "Test Key", "Test Summary", "Status"];
  const rows: string[][] = [header];

  for (const ts of sets) {
    const tests = queryBySetId.get(ts.issue_id)?.tests ?? [];
    if (tests.length === 0) {
      rows.push([ts.jira.key, ts.jira.summary, "", "", ""]);
    } else {
      for (const t of tests) {
        rows.push([
          ts.jira.key,
          ts.jira.summary,
          t.jira.key,
          t.jira.summary,
          t.latest_status?.name ?? "NOT RUN",
        ]);
      }
    }
  }

  return rows.map((r) => r.map(escapeCsvCell).join(",")).join("\r\n");
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function passRate(tests: XrayTestWithStatus[]): number | null {
  if (tests.length === 0) return null;
  const passed = tests.filter((t) => {
    const name = t.latest_status?.name ?? "TODO";
    return findSlice(name).key === "PASS";
  }).length;
  return passed / tests.length;
}

function hasFail(tests: XrayTestWithStatus[]): boolean {
  return tests.some((t) => {
    const name = t.latest_status?.name ?? "TODO";
    return findSlice(name).key === "FAIL";
  });
}

// ── Coverage history sparkline panel ─────────────────────────────────────────

interface CoverageHistoryPanelProps {
  history: CoverageSnapshot[];
  onClear: () => void;
}

function CoverageHistoryPanel({ history, onClear }: CoverageHistoryPanelProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (history.length === 0) return null;

  const W = 560;
  const H = 80;
  const PAD_L = 4;
  const PAD_R = 4;
  const PAD_T = 6;
  const PAD_B = 18; // room for x-axis labels

  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  // Map a snapshot index → x pixel
  const xOf = (i: number) =>
    history.length === 1 ? PAD_L + innerW / 2 : PAD_L + (i / (history.length - 1)) * innerW;

  // Map a 0-100 value → y pixel (0% at bottom, 100% at top)
  const yOf = (pct: number) => PAD_T + innerH - (pct / 100) * innerH;

  // Build an SVG polyline points string for a metric
  const polylinePoints = (values: number[]) =>
    values.map((v, i) => `${xOf(i)},${yOf(v)}`).join(" ");

  // Build a closed area polygon (polyline + baseline)
  const areaPoints = (values: number[]) => {
    const line = values.map((v, i) => `${xOf(i)},${yOf(v)}`).join(" ");
    const baseline = `${xOf(values.length - 1)},${yOf(0)} ${xOf(0)},${yOf(0)}`;
    return `${line} ${baseline}`;
  };

  const coverageVals = history.map((s) => s.coveragePct);
  const passVals = history.map((s) =>
    s.total > 0 ? Math.round((s.passCount / s.total) * 100) : 0,
  );
  const failVals = history.map((s) =>
    s.total > 0 ? Math.round((s.failCount / s.total) * 100) : 0,
  );

  const hovered = hoveredIdx !== null ? history[hoveredIdx] : null;

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  const formatDateTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // X-axis date labels: show first, last, and up to 3 evenly-spaced middle ones
  const labelIndices = (() => {
    if (history.length <= 2) return history.map((_, i) => i);
    const indices = new Set([0, history.length - 1]);
    const steps = Math.min(3, history.length - 2);
    for (let s = 1; s <= steps; s++) {
      indices.add(Math.round((s / (steps + 1)) * (history.length - 1)));
    }
    return [...indices].sort((a, b) => a - b);
  })();

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <TrendingUp className="h-3.5 w-3.5 text-slate-400" />
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Coverage history
          </p>
          <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400">
            {history.length} snapshot{history.length !== 1 ? "s" : ""}
          </span>
        </div>
        <button
          onClick={onClear}
          className="rounded p-1 text-slate-300 hover:bg-slate-200 hover:text-slate-500 dark:hover:bg-slate-700 dark:text-slate-600 dark:hover:text-slate-400"
          title="Clear history for this selection"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {history.length < 2 ? (
        <p className="py-2 text-center text-xs italic text-slate-400">
          Keep this selection open — more snapshots will be recorded over time.
        </p>
      ) : (
        <>
          {/* Legend */}
          <div className="mb-2 flex items-center gap-4">
            {[
              { label: "Coverage", color: "#3b82f6" },
              { label: "Passed", color: "#10b981" },
              { label: "Failed", color: "#ef4444" },
            ].map(({ label, color }) => (
              <div key={label} className="flex items-center gap-1">
                <span
                  className="inline-block h-0.5 w-4 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="text-[10px] text-slate-500">{label}</span>
              </div>
            ))}
          </div>

          {/* SVG chart */}
          <div className="relative" onMouseLeave={() => setHoveredIdx(null)}>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="w-full"
              style={{ height: H }}
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const mx = ((e.clientX - rect.left) / rect.width) * W;
                // Find closest snapshot
                let best = 0;
                let bestDist = Infinity;
                history.forEach((_, i) => {
                  const d = Math.abs(xOf(i) - mx);
                  if (d < bestDist) {
                    bestDist = d;
                    best = i;
                  }
                });
                setHoveredIdx(best);
              }}
            >
              {/* Y-axis gridlines at 0%, 50%, 100% */}
              {[0, 50, 100].map((pct) => (
                <line
                  key={pct}
                  x1={PAD_L}
                  y1={yOf(pct)}
                  x2={W - PAD_R}
                  y2={yOf(pct)}
                  stroke="currentColor"
                  strokeWidth="0.5"
                  className="text-slate-200 dark:text-slate-700"
                  strokeDasharray={pct === 0 || pct === 100 ? "none" : "3,3"}
                />
              ))}

              {/* Coverage area (filled) */}
              <polygon points={areaPoints(coverageVals)} fill="#3b82f6" fillOpacity={0.08} />
              {/* Pass area */}
              <polygon points={areaPoints(passVals)} fill="#10b981" fillOpacity={0.08} />

              {/* Coverage line */}
              <polyline
                points={polylinePoints(coverageVals)}
                fill="none"
                stroke="#3b82f6"
                strokeWidth="1.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {/* Pass line */}
              <polyline
                points={polylinePoints(passVals)}
                fill="none"
                stroke="#10b981"
                strokeWidth="1.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {/* Fail line */}
              <polyline
                points={polylinePoints(failVals)}
                fill="none"
                stroke="#ef4444"
                strokeWidth="1.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />

              {/* Hovered vertical line */}
              {hoveredIdx !== null && (
                <line
                  x1={xOf(hoveredIdx)}
                  y1={PAD_T}
                  x2={xOf(hoveredIdx)}
                  y2={PAD_T + innerH}
                  stroke="currentColor"
                  strokeWidth="1"
                  className="text-slate-400"
                  strokeDasharray="3,2"
                />
              )}

              {/* Dots at hovered index */}
              {hoveredIdx !== null &&
                [
                  { vals: coverageVals, color: "#3b82f6" },
                  { vals: passVals, color: "#10b981" },
                  { vals: failVals, color: "#ef4444" },
                ].map(({ vals, color }) => (
                  <circle
                    key={color}
                    cx={xOf(hoveredIdx)}
                    cy={yOf(vals[hoveredIdx]!)}
                    r={3}
                    fill={color}
                    stroke="white"
                    strokeWidth="1.5"
                  />
                ))}

              {/* X-axis date labels */}
              {labelIndices.map((i) => (
                <text
                  key={i}
                  x={xOf(i)}
                  y={H - 3}
                  textAnchor={i === 0 ? "start" : i === history.length - 1 ? "end" : "middle"}
                  fontSize="7"
                  className="fill-slate-400"
                >
                  {formatDate(history[i]!.timestamp)}
                </text>
              ))}
            </svg>

            {/* Tooltip */}
            {hovered && hoveredIdx !== null && (
              <div
                className="pointer-events-none absolute z-10 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-md dark:border-slate-600 dark:bg-slate-800"
                style={{
                  top: 0,
                  left:
                    hoveredIdx < history.length / 2
                      ? `calc(${(xOf(hoveredIdx) / W) * 100}% + 10px)`
                      : undefined,
                  right:
                    hoveredIdx >= history.length / 2
                      ? `calc(${((W - xOf(hoveredIdx)) / W) * 100}% + 10px)`
                      : undefined,
                }}
              >
                <p className="mb-1.5 text-[10px] font-semibold text-slate-500">
                  {formatDateTime(hovered.timestamp)}
                </p>
                <div className="space-y-0.5">
                  {[
                    {
                      label: "Coverage",
                      value: `${hovered.coveragePct}%`,
                      color: "#3b82f6",
                    },
                    {
                      label: "Passed",
                      value: `${hovered.total > 0 ? Math.round((hovered.passCount / hovered.total) * 100) : 0}%`,
                      color: "#10b981",
                    },
                    {
                      label: "Failed",
                      value: `${hovered.total > 0 ? Math.round((hovered.failCount / hovered.total) * 100) : 0}%`,
                      color: "#ef4444",
                    },
                    {
                      label: "Not yet run",
                      value: `${hovered.todoCount} / ${hovered.total}`,
                      color: "#94a3b8",
                    },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="flex items-center gap-2 text-[10px]">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-slate-500">{label}</span>
                      <span className="ml-auto font-semibold text-slate-700 dark:text-slate-200">
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Overall dashboard card ────────────────────────────────────────────────────

interface OverallDashboardProps {
  allTests: XrayTestWithStatus[];
  selectedCount: number;
  queryBySetId: Map<
    string,
    { tests: XrayTestWithStatus[] | undefined; isLoading: boolean; isError: boolean }
  >;
  history: CoverageSnapshot[];
  onClearHistory: () => void;
}

function OverallDashboard({
  allTests,
  selectedCount,
  queryBySetId,
  history,
  onClearHistory,
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

        {/* ── Coverage history sparkline ── */}
        <CoverageHistoryPanel history={history} onClear={onClearHistory} />
      </div>
    </div>
  );
}

// ── Small metric tile used in OverallDashboard grid ───────────────────────────

type TileColor = "slate" | "red" | "emerald" | "amber" | "blue";

const tileColors: Record<TileColor, { value: string; sub: string; bg: string; border: string }> = {
  slate: {
    value: "text-slate-700 dark:text-slate-200",
    sub: "text-slate-400",
    bg: "bg-slate-50 dark:bg-slate-800/40",
    border: "border-slate-200 dark:border-slate-700",
  },
  red: {
    value: "text-red-600 dark:text-red-400",
    sub: "text-red-400",
    bg: "bg-red-50 dark:bg-red-900/20",
    border: "border-red-200 dark:border-red-800",
  },
  emerald: {
    value: "text-emerald-600 dark:text-emerald-400",
    sub: "text-emerald-500",
    bg: "bg-emerald-50 dark:bg-emerald-900/20",
    border: "border-emerald-200 dark:border-emerald-800",
  },
  amber: {
    value: "text-amber-600 dark:text-amber-400",
    sub: "text-amber-500",
    bg: "bg-amber-50 dark:bg-amber-900/20",
    border: "border-amber-200 dark:border-amber-800",
  },
  blue: {
    value: "text-blue-600 dark:text-blue-400",
    sub: "text-blue-500",
    bg: "bg-blue-50 dark:bg-blue-900/20",
    border: "border-blue-200 dark:border-blue-800",
  },
};

function MetricTile({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color: TileColor;
}) {
  const c = tileColors[color];
  return (
    <div className={cn("rounded-xl border px-3 py-2.5", c.bg, c.border)}>
      <p className="mb-1 text-[10px] font-medium text-slate-400">{label}</p>
      <p className={cn("text-xl font-bold leading-none", c.value)}>{value}</p>
      <p className={cn("mt-1 text-[10px]", c.sub)}>{sub}</p>
    </div>
  );
}

function CoverageTile({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: TileColor;
}) {
  const c = tileColors[color];
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className={cn("rounded-lg border px-3 py-2", c.bg, c.border)}>
      <p className="mb-0.5 text-[10px] text-slate-400">{label}</p>
      <p className={cn("text-lg font-bold leading-none", c.value)}>{value}</p>
      <p className={cn("mt-0.5 text-[10px]", c.sub)}>{pct}%</p>
    </div>
  );
}

// ── Single test set section ───────────────────────────────────────────────────

type SortBy = "key" | "name" | "status";
type SortDir = "asc" | "desc";

interface TestSetSectionProps {
  testSet: XrayTestSet;
  tests: XrayTestWithStatus[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  testSearch: string;
  statusFilter: string | null;
}

const TestSetSection = memo(function TestSetSection({
  testSet,
  tests,
  isLoading,
  isError,
  error,
  onRetry,
  testSearch,
  statusFilter,
}: TestSetSectionProps) {
  const [collapsed, setCollapsed] = useState(true);
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

  const SortIcon = ({ col }: { col: SortBy }) => {
    if (sortBy !== col) return <ArrowUpDown className="h-3 w-3 text-slate-300" />;
    return sortDir === "asc" ? (
      <ArrowUp className="h-3 w-3 text-slate-500" />
    ) : (
      <ArrowDown className="h-3 w-3 text-slate-500" />
    );
  };

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
                  <SortIcon col={col} />
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
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  <span className="w-28 shrink-0 font-mono text-xs text-slate-400">
                    {test.jira.key}
                  </span>
                  <span className="flex-1 truncate text-sm text-slate-700 dark:text-slate-300">
                    {test.jira.summary}
                  </span>
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

// ── Status badge ──────────────────────────────────────────────────────────────

interface StatusBadgeProps {
  name: string;
  color?: string;
}

function StatusBadge({ name, color }: StatusBadgeProps) {
  const sl = findSlice(name);
  if (color && color.startsWith("#")) {
    return (
      <span
        className="inline-block rounded px-2 py-0.5 text-xs font-semibold"
        style={{ backgroundColor: color + "26", color }}
      >
        {name}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-block rounded px-2 py-0.5 text-xs font-semibold",
        sl.lightBg,
        sl.textClass,
      )}
    >
      {name}
    </span>
  );
}

// ── Status filter chips ───────────────────────────────────────────────────────

interface StatusFilterChipsProps {
  slices: Slice[];
  activeFilter: string | null;
  onToggle: (key: string) => void;
}

function StatusFilterChips({ slices, activeFilter, onToggle }: StatusFilterChipsProps) {
  if (slices.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] font-medium text-slate-400">Filter:</span>
      {slices.map((sl) => {
        const isActive = activeFilter === sl.key;
        return (
          <button
            key={sl.key}
            onClick={() => onToggle(sl.key)}
            className={cn(
              "flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
              isActive
                ? "border-transparent text-white"
                : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-slate-500 dark:hover:bg-slate-700",
            )}
            style={isActive ? { backgroundColor: sl.color, borderColor: sl.color } : {}}
            title={`Show only ${sl.label} tests (${sl.count})`}
          >
            {isActive && <XCircle className="h-3 w-3 opacity-80" />}
            {sl.label}
            <span
              className={cn(
                "ml-0.5 rounded-full px-1 text-[10px]",
                isActive ? "bg-white/20" : "bg-slate-100 dark:bg-slate-700",
              )}
            >
              {sl.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Presets bar ───────────────────────────────────────────────────────────────

interface PresetsBarProps {
  selectedSetIds: Set<string>;
  onLoad: (preset: CoveragePreset) => void;
  activePresetId: string | null;
  isModified: boolean;
  onSave: (name: string) => void;
  onUpdate: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}

function PresetsBar({
  selectedSetIds,
  onLoad,
  activePresetId,
  isModified,
  onSave,
  onUpdate,
  onDelete,
  onRename,
}: PresetsBarProps) {
  const presets = useCoveragePresetsStore((s) => s.presets);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Focus the save-name input when it appears.
  useEffect(() => {
    if (saving) nameInputRef.current?.focus();
  }, [saving]);

  // Focus the rename input when it appears.
  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus();
  }, [renamingId]);

  const handleSaveConfirm = () => {
    const name = newName.trim();
    if (!name) return;
    onSave(name);
    setNewName("");
    setSaving(false);
  };

  const handleRenameConfirm = (id: string) => {
    const name = renameValue.trim();
    if (name) onRename(id, name);
    setRenamingId(null);
    setRenameValue("");
  };

  const startRename = (preset: CoveragePreset) => {
    setRenamingId(preset.id);
    setRenameValue(preset.name);
    setSaving(false);
  };

  const canSave = selectedSetIds.size > 0;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <BookmarkCheck className="h-3.5 w-3.5 text-slate-400" />
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Presets</p>
        </div>

        {/* Save / Update buttons */}
        <div className="flex items-center gap-1.5">
          {activePresetId && isModified && (
            <button
              onClick={onUpdate}
              className="flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/40"
              title="Update current preset with the current selection"
            >
              <BookmarkCheck className="h-3.5 w-3.5" />
              Update
            </button>
          )}
          {canSave && !saving && (
            <button
              onClick={() => {
                setSaving(true);
                setRenamingId(null);
              }}
              className="flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700"
              title="Save current selection as a new preset"
            >
              <BookmarkPlus className="h-3.5 w-3.5" />
              Save
            </button>
          )}
        </div>
      </div>

      {/* Inline name input for new preset */}
      {saving && (
        <div className="flex items-center gap-1.5">
          <Input
            ref={nameInputRef}
            className="h-7 flex-1 text-xs"
            placeholder="Preset name…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveConfirm();
              if (e.key === "Escape") {
                setSaving(false);
                setNewName("");
              }
            }}
          />
          <button
            onClick={handleSaveConfirm}
            disabled={!newName.trim()}
            className="rounded px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
          >
            Save
          </button>
          <button
            onClick={() => {
              setSaving(false);
              setNewName("");
            }}
            className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-100"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Preset chips */}
      {presets.length === 0 && !saving && (
        <p className="text-xs italic text-slate-400 dark:text-slate-500">
          {canSave ? 'Click "Save" to create your first preset.' : "No presets yet."}
        </p>
      )}

      {presets.length > 0 && (
        <div className="space-y-1">
          {presets.map((preset) => {
            const isActive = preset.id === activePresetId;

            if (renamingId === preset.id) {
              return (
                <div key={preset.id} className="flex items-center gap-1.5">
                  <Input
                    ref={renameInputRef}
                    className="h-7 flex-1 text-xs"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRenameConfirm(preset.id);
                      if (e.key === "Escape") {
                        setRenamingId(null);
                        setRenameValue("");
                      }
                    }}
                  />
                  <button
                    onClick={() => handleRenameConfirm(preset.id)}
                    disabled={!renameValue.trim()}
                    className="rounded px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
                  >
                    OK
                  </button>
                  <button
                    onClick={() => {
                      setRenamingId(null);
                      setRenameValue("");
                    }}
                    className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-100"
                  >
                    ✕
                  </button>
                </div>
              );
            }

            return (
              <div key={preset.id} className="group flex items-center gap-1">
                <button
                  onClick={() => onLoad(preset)}
                  className={cn(
                    "flex flex-1 items-center gap-1.5 truncate rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors",
                    isActive && !isModified
                      ? "border-slate-700 bg-slate-700 font-semibold text-white"
                      : isActive && isModified
                        ? "border-amber-400 bg-amber-50 font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:bg-slate-700",
                  )}
                  title={`${preset.setIds.length} set${preset.setIds.length !== 1 ? "s" : ""}`}
                >
                  <span className="truncate">{preset.name}</span>
                  <span
                    className={cn(
                      "ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                      isActive && !isModified
                        ? "bg-white/20 text-white"
                        : isActive && isModified
                          ? "bg-amber-200 text-amber-700 dark:bg-amber-800 dark:text-amber-300"
                          : "bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-400",
                    )}
                  >
                    {preset.setIds.length}
                  </span>
                  {isActive && isModified && (
                    <span className="shrink-0 text-[10px] font-normal text-amber-600">
                      modified
                    </span>
                  )}
                </button>

                {/* Action icons (shown on hover) */}
                <button
                  onClick={() => startRename(preset)}
                  className="shrink-0 rounded p-1 text-slate-300 opacity-0 transition-opacity hover:bg-slate-100 hover:text-slate-500 group-hover:opacity-100 dark:hover:bg-slate-700 dark:text-slate-400"
                  title="Rename preset"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  onClick={() => onDelete(preset.id)}
                  className="shrink-0 rounded p-1 text-slate-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 dark:hover:bg-red-900/30 dark:text-slate-400"
                  title="Delete preset"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function CoveragePage() {
  const projectKey = useContentProjectKey();
  const queryClient = useQueryClient();
  const { savePreset, updatePreset, deletePreset, renamePreset } = useCoveragePresetsStore();
  const {
    data: testSets,
    isLoading: setsLoading,
    isError: setsError,
    refetch: refetchSets,
    isFetching: setsFetching,
  } = useGetTestSets(projectKey ?? undefined);

  const [setSearch, setSetSearch] = useState("");
  const [testSearch, setTestSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [selectedSetIds, setSelectedSetIds] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [loadedPresetSetIds, setLoadedPresetSetIds] = useState<string[]>([]);

  // Dirty detection: preset is "modified" when selection drifts from what was loaded.
  const isModified = useMemo(() => {
    if (!activePresetId) return false;
    const current = [...selectedSetIds].sort().join(",");
    const original = [...loadedPresetSetIds].sort().join(",");
    return current !== original;
  }, [activePresetId, selectedSetIds, loadedPresetSetIds]);

  // Filtered list of test sets for the selector panel.
  const filteredSets = useMemo(() => {
    const q = setSearch.trim().toLowerCase();
    return (testSets ?? []).filter(
      (ts) =>
        !q || ts.jira.key.toLowerCase().includes(q) || ts.jira.summary.toLowerCase().includes(q),
    );
  }, [testSets, setSearch]);

  // The ordered list of selected test set objects (preserving display order).
  const selectedSets = useMemo(
    () => (testSets ?? []).filter((ts) => selectedSetIds.has(ts.issue_id)),
    [testSets, selectedSetIds],
  );

  // Fetch tests-with-status for every selected set in parallel.
  const testQueries = useQueries({
    queries: selectedSets.map((ts) => ({
      queryKey: queryKeys.testSetTestsWithStatus(ts.issue_id),
      queryFn: () => api.getTestSetTestsWithStatus(ts.issue_id),
      enabled: true,
      staleTime: 2 * 60 * 1_000,
    })),
  });

  const queryBySetId = useMemo(() => {
    const map = new Map<
      string,
      {
        tests: XrayTestWithStatus[] | undefined;
        isLoading: boolean;
        isError: boolean;
        error: unknown;
      }
    >();
    selectedSets.forEach((ts, i) => {
      const q = testQueries[i];
      map.set(ts.issue_id, {
        tests: q?.data,
        isLoading: q?.isLoading ?? false,
        isError: q?.isError ?? false,
        error: q?.error,
      });
    });
    return map;
  }, [selectedSets, testQueries]);

  // Grand total across all loaded sets.
  const allTests = useMemo(
    () => [...queryBySetId.values()].flatMap((q) => q.tests ?? []),
    [queryBySetId],
  );

  // Slices for the status filter chips (derived from all loaded tests).
  const allSlices = useMemo(() => buildSlicesFromTests(allTests), [allTests]);

  // ── Coverage history ─────────────────────────────────────────────────────────
  const recordSnapshot = useCoverageHistoryStore((s) => s.recordSnapshot);
  const clearHistory = useCoverageHistoryStore((s) => s.clearHistory);
  const historyByView = useCoverageHistoryStore((s) => s.history);

  // Stable view key for the current project + set selection.
  const viewKey = useMemo(
    () =>
      projectKey && selectedSetIds.size > 0 ? buildViewKey(projectKey, [...selectedSetIds]) : null,
    [projectKey, selectedSetIds],
  );

  // All queries are "settled" when none are still loading/fetching.
  const allQueriesSettled = useMemo(
    () =>
      testQueries.length > 0 &&
      testQueries.every((q) => !q.isLoading && !q.isFetching && !q.isError),
    [testQueries],
  );

  // Auto-record a snapshot whenever the selection settles with fresh data.
  useEffect(() => {
    if (!viewKey || !allQueriesSettled || allTests.length === 0) return;

    const passCount = allSlices.find((s) => s.key === "PASS")?.count ?? 0;
    const failCount = allSlices.find((s) => s.key === "FAIL")?.count ?? 0;
    const todoCount = allTests.filter((t) => t.latest_status?.is_final !== true).length;
    const runCount = allTests.length - todoCount;
    const coveragePct = allTests.length > 0 ? Math.round((runCount / allTests.length) * 100) : 0;

    recordSnapshot(viewKey, {
      total: allTests.length,
      runCount,
      passCount,
      failCount,
      todoCount,
      coveragePct,
    });
  }, [viewKey, allQueriesSettled, allTests, allSlices, recordSnapshot]);

  // Snapshots for the current view key, oldest-first.
  const currentHistory = useMemo(
    () => (viewKey ? (historyByView[viewKey] ?? []) : []),
    [viewKey, historyByView],
  );

  const handleToggleStatusFilter = (key: string) => {
    setStatusFilter((prev) => (prev === key ? null : key));
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetchSets();
    setIsRefreshing(false);
  };

  const handleExportCSV = async () => {
    if (selectedSets.length === 0) return;
    const path = await saveDialog({
      title: "Export coverage as CSV",
      defaultPath: "coverage.csv",
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (!path) return;
    setIsExporting(true);
    try {
      const csv = buildCoverageCSV(selectedSets, queryBySetId);
      await api.writeTextFile(path, csv);
    } finally {
      setIsExporting(false);
    }
  };

  const toggleSet = (id: string) => {
    setSelectedSetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedSetIds(new Set(filteredSets.map((ts) => ts.issue_id)));
  const clearAll = () => setSelectedSetIds(new Set());

  // ── Preset handlers ──────────────────────────────────────────────────────────

  const handleLoadPreset = (preset: CoveragePreset) => {
    setSelectedSetIds(new Set(preset.setIds));
    setActivePresetId(preset.id);
    setLoadedPresetSetIds(preset.setIds);
  };

  const handleSavePreset = (name: string) => {
    const ids = [...selectedSetIds];
    const preset = savePreset(name, ids);
    setActivePresetId(preset.id);
    setLoadedPresetSetIds(ids);
  };

  const handleUpdatePreset = () => {
    if (!activePresetId) return;
    const ids = [...selectedSetIds];
    const existing = useCoveragePresetsStore
      .getState()
      .presets.find((p) => p.id === activePresetId);
    if (!existing) return;
    updatePreset(activePresetId, existing.name, ids);
    setLoadedPresetSetIds(ids);
  };

  const handleDeletePreset = (id: string) => {
    deletePreset(id);
    if (activePresetId === id) {
      setActivePresetId(null);
      setLoadedPresetSetIds([]);
    }
  };

  if (!projectKey) {
    return (
      <EmptyState icon={Activity} message="Set a Project Key in Settings to view test coverage." />
    );
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-6">
      {/* ── Left panel: presets + set selector ── */}
      <div className="flex w-72 shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        {/* Presets section */}
        <div className="border-b border-slate-100 px-4 py-4 dark:border-slate-700/60">
          <PresetsBar
            selectedSetIds={selectedSetIds}
            onLoad={handleLoadPreset}
            activePresetId={activePresetId}
            isModified={isModified}
            onSave={handleSavePreset}
            onUpdate={handleUpdatePreset}
            onDelete={handleDeletePreset}
            onRename={(id, name) => renamePreset(id, name)}
          />
        </div>

        {/* Test sets section */}
        <div className="flex min-h-0 flex-1 flex-col gap-0">
          {/* Section header */}
          <div className="flex items-center justify-between bg-slate-50 px-4 py-2.5 dark:bg-slate-800/50">
            <div className="flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-slate-400" />
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Test Sets
              </p>
              {(testSets?.length ?? 0) > 0 && (
                <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                  {testSets!.length}
                </span>
              )}
            </div>
            <button
              onClick={() => void handleRefresh()}
              disabled={setsFetching || isRefreshing}
              className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600 disabled:opacity-40 dark:hover:bg-slate-700"
              title="Reload test sets"
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5", (setsFetching || isRefreshing) && "animate-spin")}
              />
            </button>
          </div>

          {/* Search + controls */}
          <div className="flex flex-col gap-2 border-b border-slate-100 px-3 py-2.5 dark:border-slate-700/60">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                className="pl-8 text-xs"
                placeholder="Filter sets…"
                value={setSearch}
                onChange={(e) => setSetSearch(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">
                {selectedSetIds.size > 0 ? (
                  <>
                    <span className="font-semibold text-slate-600 dark:text-slate-300">
                      {selectedSetIds.size}
                    </span>{" "}
                    / {filteredSets.length} selected
                  </>
                ) : (
                  <>
                    {filteredSets.length} set{filteredSets.length !== 1 ? "s" : ""}
                  </>
                )}
              </span>
              <div className="flex gap-1">
                <button
                  className="rounded-md px-2 py-0.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                  onClick={selectAll}
                >
                  All
                </button>
                {selectedSetIds.size > 0 && (
                  <button
                    className="rounded-md px-2 py-0.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                    onClick={clearAll}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Scrollable list */}
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {setsLoading && (
              <div className="space-y-2 px-1">
                <div className="flex items-center gap-2 py-1 text-sm text-slate-500">
                  <Spinner size="sm" />
                  <span>Loading…</span>
                </div>
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full rounded-lg" />
                ))}
              </div>
            )}
            {setsError && (
              <div className="m-1 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
                Failed to load test sets.{" "}
                <button className="underline dark:text-red-400" onClick={() => void refetchSets()}>
                  Retry
                </button>
              </div>
            )}
            {!setsLoading && !setsError && filteredSets.length === 0 && (
              <p className="py-4 text-center text-xs italic text-slate-400">
                {setSearch.trim()
                  ? "No test sets match the filter."
                  : `No test sets found in ${projectKey}.`}
              </p>
            )}
            <div className="space-y-0.5">
              {filteredSets.map((ts) => {
                const selected = selectedSetIds.has(ts.issue_id);
                return (
                  <button
                    key={ts.issue_id}
                    onClick={() => toggleSet(ts.issue_id)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                      selected
                        ? "bg-slate-800 text-white dark:bg-slate-700"
                        : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
                    )}
                  >
                    <span className="shrink-0">
                      {selected ? (
                        <CheckSquare2 className="h-4 w-4 text-slate-300" />
                      ) : (
                        <Square className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium leading-tight">
                        {ts.jira.summary}
                      </p>
                      <p
                        className={cn(
                          "mt-0.5 font-mono text-[10px] leading-tight",
                          selected ? "text-slate-400" : "text-slate-400",
                        )}
                      >
                        {ts.jira.key}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Right panel: coverage dashboard ── */}
      <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-hidden">
        {/* Header row */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-slate-400" />
            <h1 className="text-xl font-semibold dark:text-slate-100">
              Coverage
              <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-400">
                {projectKey}
              </span>
            </h1>
          </div>
          {/* Status filter chips — shown when tests are loaded */}
          {allSlices.length > 0 && (
            <StatusFilterChips
              slices={allSlices}
              activeFilter={statusFilter}
              onToggle={handleToggleStatusFilter}
            />
          )}
          <div className="relative ml-auto w-48 shrink-0">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-8 text-xs"
              placeholder="Filter tests…"
              value={testSearch}
              onChange={(e) => setTestSearch(e.target.value)}
            />
          </div>
          {/* CSV Export */}
          {selectedSets.length > 0 && (
            <button
              onClick={() => void handleExportCSV()}
              disabled={isExporting}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:bg-slate-700"
              title="Export coverage data to CSV"
            >
              {isExporting ? <Spinner size="sm" /> : <Download className="h-3.5 w-3.5" />}
              Export CSV
            </button>
          )}
        </div>

        {selectedSets.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-slate-400 dark:text-slate-500">
            <Layers className="h-12 w-12 opacity-30" />
            <p className="text-sm">Select test sets on the left to view coverage.</p>
          </div>
        )}

        {selectedSets.length > 0 && (
          <div className="flex-1 space-y-4 overflow-y-auto pb-4">
            {/* Overall dashboard with smarter metrics + coverage completeness */}
            <OverallDashboard
              allTests={allTests}
              selectedCount={selectedSets.length}
              queryBySetId={queryBySetId}
              history={currentHistory}
              onClearHistory={() => {
                if (viewKey) clearHistory(viewKey);
              }}
            />

            {/* Per-set sections */}
            {selectedSets.map((ts) => {
              const q = queryBySetId.get(ts.issue_id);
              return (
                <TestSetSection
                  key={ts.issue_id}
                  testSet={ts}
                  tests={q?.tests}
                  isLoading={q?.isLoading ?? false}
                  isError={q?.isError ?? false}
                  error={q?.error}
                  onRetry={() =>
                    void queryClient.refetchQueries({
                      queryKey: queryKeys.testSetTestsWithStatus(ts.issue_id),
                    })
                  }
                  testSearch={testSearch}
                  statusFilter={statusFilter}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
