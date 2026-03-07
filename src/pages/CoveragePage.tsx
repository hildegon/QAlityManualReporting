import { useState, useMemo } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useGetTestSets, queryKeys } from "@/services/queries";
import { useContentProjectKey } from "@/hooks/useProjectKey";
import { parseRateLimitError } from "@/stores/uiStore";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Activity,
  AlertTriangle,
  CheckSquare2,
  ChevronDown,
  ChevronRight,
  Clock,
  Layers,
  RefreshCw,
  Search,
  Square,
} from "lucide-react";
import { cn } from "@/components/ui/utils";
import type { XrayTestSet, XrayTestWithStatus } from "@/types";
import * as api from "@/services/tauri";

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_NOT_RUN = "NOT RUN";

/**
 * Determine a Tailwind background + text class pair for a status name.
 * If Xray provides a hex color we use an inline style instead; this fallback
 * covers the common standard statuses when color is absent.
 */
function statusClasses(name: string): { bg: string; text: string } {
  const n = name.toUpperCase();
  if (n === "PASS" || n === "PASSED") return { bg: "bg-emerald-100", text: "text-emerald-800" };
  if (n === "FAIL" || n === "FAILED") return { bg: "bg-red-100", text: "text-red-800" };
  if (n === "TODO" || n === "NOT RUN") return { bg: "bg-slate-100", text: "text-slate-500" };
  if (n === "EXECUTING") return { bg: "bg-blue-100", text: "text-blue-800" };
  if (n === "BLOCKED") return { bg: "bg-amber-100", text: "text-amber-800" };
  if (n === "ABORTED" || n === "CANCELLED") return { bg: "bg-orange-100", text: "text-orange-800" };
  return { bg: "bg-slate-100", text: "text-slate-600" };
}

/** Convert a #RRGGBB or rgb(...) hex color to a light background tint. */
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return "";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Status badge ──────────────────────────────────────────────────────────────

interface StatusBadgeProps {
  name: string;
  color?: string;
}

function StatusBadge({ name, color }: StatusBadgeProps) {
  const { bg, text } = statusClasses(name);
  if (color && color.startsWith("#")) {
    const bgColor = hexToRgba(color, 0.15);
    return (
      <span
        className="inline-block rounded px-2 py-0.5 text-xs font-semibold"
        style={{ backgroundColor: bgColor, color }}
      >
        {name}
      </span>
    );
  }
  return (
    <span className={cn("inline-block rounded px-2 py-0.5 text-xs font-semibold", bg, text)}>
      {name}
    </span>
  );
}

// ── Summary bar ───────────────────────────────────────────────────────────────

interface SummaryBarProps {
  tests: XrayTestWithStatus[];
  compact?: boolean;
}

function SummaryBar({ tests, compact }: SummaryBarProps) {
  const counts = useMemo(() => {
    const map = new Map<string, { count: number; color?: string }>();
    for (const t of tests) {
      const name = t.latest_status?.name ?? STATUS_NOT_RUN;
      const color = t.latest_status?.color;
      const existing = map.get(name);
      if (existing) {
        existing.count++;
      } else {
        map.set(name, { count: 1, ...(color !== undefined ? { color } : {}) });
      }
    }
    return map;
  }, [tests]);

  const total = tests.length;
  if (total === 0) return null;

  const entries = [...counts.entries()];

  return (
    <div className={cn("flex flex-wrap items-center gap-2", compact ? "text-xs" : "text-sm")}>
      {!compact && (
        <span className="font-medium text-slate-600">
          {total} test{total !== 1 ? "s" : ""}
        </span>
      )}
      {entries.map(([name, { count, color }]) => {
        const { bg, text } = statusClasses(name);
        const pct = Math.round((count / total) * 100);
        const style: React.CSSProperties = {};
        if (color?.startsWith("#")) {
          style.backgroundColor = hexToRgba(color, 0.15);
          style.color = color;
        }
        return (
          <span
            key={name}
            title={`${count} / ${total} (${pct}%)`}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium",
              !color?.startsWith("#") && cn(bg, text),
            )}
            style={style}
          >
            {count} {name}
            <span className="opacity-60">({pct}%)</span>
          </span>
        );
      })}
    </div>
  );
}

// ── Single test set section ───────────────────────────────────────────────────

interface TestSetSectionProps {
  testSet: XrayTestSet;
  tests: XrayTestWithStatus[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  testSearch: string;
}

function TestSetSection({
  testSet,
  tests,
  isLoading,
  isError,
  error,
  onRetry,
  testSearch,
}: TestSetSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const rateLimitUntil = isError ? parseRateLimitError(error) : null;
  const errorMessage = isError ? (error instanceof Error ? error.message : String(error)) : null;

  const filtered = useMemo(() => {
    if (!tests) return [];
    const q = testSearch.trim().toLowerCase();
    if (!q) return tests;
    return tests.filter(
      (t) => t.jira.key.toLowerCase().includes(q) || t.jira.summary.toLowerCase().includes(q),
    );
  }, [tests, testSearch]);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      {/* Section header */}
      <button
        className="flex w-full items-center gap-3 bg-slate-50 px-4 py-3 text-left hover:bg-slate-100"
        onClick={() => setCollapsed((c) => !c)}
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
        )}
        <Layers className="h-4 w-4 shrink-0 text-slate-400" />
        <span className="w-28 shrink-0 font-mono text-xs text-slate-500">{testSet.jira.key}</span>
        <span className="flex-1 truncate text-sm font-semibold text-slate-700">
          {testSet.jira.summary}
        </span>
        {isLoading && <Spinner size="sm" />}
        {!isLoading && !isError && tests && <SummaryBar tests={tests} compact />}
      </button>

      {/* Test rows */}
      {!collapsed && (
        <div className="divide-y divide-slate-100">
          {isLoading && (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-slate-400">
              <Spinner size="sm" />
              Loading tests…
            </div>
          )}
          {isError && (
            <div className="flex items-start gap-2 px-4 py-3 text-sm text-red-600">
              {rateLimitUntil !== null ? (
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <div className="flex-1">
                {rateLimitUntil !== null ? (
                  <span className="text-amber-700">
                    Rate limited — please wait before retrying.
                  </span>
                ) : (
                  <span>{errorMessage ?? "Failed to load tests for this set."}</span>
                )}
              </div>
              <button
                className="shrink-0 rounded px-2 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50"
                onClick={onRetry}
              >
                Retry
              </button>
            </div>
          )}
          {!isLoading && !isError && filtered.length === 0 && (
            <p className="px-4 py-3 text-sm italic text-slate-400">
              {testSearch.trim() ? "No tests match the filter." : "This test set has no tests."}
            </p>
          )}
          {!isLoading &&
            !isError &&
            filtered.map((test) => (
              <div
                key={test.issue_id}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50"
              >
                <span className="w-28 shrink-0 font-mono text-xs text-slate-400">
                  {test.jira.key}
                </span>
                <span className="flex-1 truncate text-sm text-slate-700">{test.jira.summary}</span>
                <StatusBadge
                  name={test.latest_status?.name ?? STATUS_NOT_RUN}
                  {...(test.latest_status?.color !== undefined
                    ? { color: test.latest_status.color }
                    : {})}
                />
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function CoveragePage() {
  const projectKey = useContentProjectKey();
  const {
    data: testSets,
    isLoading: setsLoading,
    isError: setsError,
    refetch: refetchSets,
    isFetching: setsFetching,
  } = useGetTestSets(projectKey ?? undefined);

  const [setSearch, setSetSearch] = useState("");
  const [testSearch, setTestSearch] = useState("");
  const [selectedSetIds, setSelectedSetIds] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  const queryClient = useQueryClient();

  // Build a map issueId → { tests, isLoading, isError, error } for easy lookup.
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

  // Grand total across all loaded sets (for the summary bar at the top).
  const allTests = useMemo(
    () => [...queryBySetId.values()].flatMap((q) => q.tests ?? []),
    [queryBySetId],
  );

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetchSets();
    setIsRefreshing(false);
  };

  const toggleSet = (id: string) => {
    setSelectedSetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedSetIds(new Set(filteredSets.map((ts) => ts.issue_id)));
  };

  const clearAll = () => setSelectedSetIds(new Set());

  if (!projectKey) {
    return <EmptyState message="Set a Project Key in Settings to view test coverage." />;
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-6">
      {/* ── Left panel: set selector ── */}
      <div className="flex w-72 shrink-0 flex-col gap-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Test Sets</p>
          <button
            onClick={() => void handleRefresh()}
            disabled={setsFetching || isRefreshing}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
            title="Reload test sets"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", (setsFetching || isRefreshing) && "animate-spin")}
            />
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input
            className="pl-8 text-xs"
            placeholder="Filter sets…"
            value={setSearch}
            onChange={(e) => setSetSearch(e.target.value)}
          />
        </div>

        {/* Select / deselect all */}
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            {selectedSetIds.size > 0 && (
              <span className="mr-1.5 rounded-full bg-slate-700 px-1.5 py-0.5 text-white">
                {selectedSetIds.size} selected
              </span>
            )}
            {filteredSets.length} set{filteredSets.length !== 1 ? "s" : ""}
          </span>
          <div className="flex gap-2">
            <button className="hover:text-slate-700" onClick={selectAll}>
              All
            </button>
            {selectedSetIds.size > 0 && (
              <button className="hover:text-slate-700" onClick={clearAll}>
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Set list */}
        <div className="flex-1 overflow-y-auto">
          {setsLoading && (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full rounded-lg" />
              ))}
            </div>
          )}
          {setsError && (
            <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
              Failed to load test sets.{" "}
              <button className="underline" onClick={() => void refetchSets()}>
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
          <div className="space-y-1">
            {filteredSets.map((ts) => {
              const selected = selectedSetIds.has(ts.issue_id);
              return (
                <button
                  key={ts.issue_id}
                  onClick={() => toggleSet(ts.issue_id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors",
                    selected
                      ? "border-slate-700 bg-slate-700 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
                  )}
                >
                  <span className="mt-0.5 shrink-0">
                    {selected ? (
                      <CheckSquare2 className="h-4 w-4 text-white" />
                    ) : (
                      <Square className="h-4 w-4 text-slate-300" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">{ts.jira.summary}</p>
                    <p
                      className={cn(
                        "font-mono text-[10px]",
                        selected ? "text-slate-300" : "text-slate-400",
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

      {/* Divider */}
      <div className="w-px shrink-0 bg-slate-200" />

      {/* ── Right panel: coverage grid ── */}
      <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-slate-400" />
            <h1 className="text-xl font-semibold">
              Coverage
              <span className="ml-2 text-sm font-normal text-slate-500">{projectKey}</span>
            </h1>
          </div>

          {/* Test filter */}
          <div className="relative w-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-8 text-xs"
              placeholder="Filter tests…"
              value={testSearch}
              onChange={(e) => setTestSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Grand total summary bar */}
        {selectedSets.length > 0 && allTests.length > 0 && (
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Overall — {allTests.length} test{allTests.length !== 1 ? "s" : ""} across{" "}
              {selectedSets.length} set{selectedSets.length !== 1 ? "s" : ""}
            </p>
            <SummaryBar tests={allTests} />
          </div>
        )}

        {/* Empty state */}
        {selectedSets.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-slate-400">
            <Layers className="h-12 w-12 opacity-30" />
            <p className="text-sm">Select test sets on the left to view coverage.</p>
          </div>
        )}

        {/* Test set sections */}
        <div className="flex-1 space-y-3 overflow-y-auto pb-4">
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
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-48 flex-col items-center justify-center gap-3 text-slate-400">
      <Activity className="h-10 w-10 opacity-40" />
      <p className="text-sm">{message}</p>
    </div>
  );
}
