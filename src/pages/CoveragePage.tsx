import { useState, useMemo, useRef, useDeferredValue } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  Activity,
  ChevronsDown,
  ChevronsUp,
  CheckSquare2,
  Download,
  FileText,
  Layers,
  RefreshCw,
  Search,
  Square,
} from "lucide-react";
import { cn } from "@/components/ui/utils";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/common/EmptyState";
import { useGetTestSets, queryKeys } from "@/services/queries";
import { useContentProjectKey } from "@/hooks/useProjectKey";
import { useCoveragePresetsStore } from "@/stores/coveragePresetsStore";
import type { CoveragePreset } from "@/stores/coveragePresetsStore";
import type { XrayTestWithStatus } from "@/types";
import * as api from "@/services/tauri";
import { buildCoverageHTML } from "@/components/coverage/htmlReportBuilder";
import { PresetsBar } from "@/components/coverage/PresetsBar";
import { OverallDashboard } from "@/components/coverage/OverallDashboard";
import { TestSetSection } from "@/components/coverage/TestSetSection";
import { InsightsPanel, FailureConcentrationPanel, NeverRunPanel } from "@/components/coverage/AnalysisPanels";
import { CoverageTestDetailModal } from "@/components/coverage/CoverageTestDetailModal";
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
  const deferredSetSearch = useDeferredValue(setSearch);
  const deferredTestSearch = useDeferredValue(testSearch);
  const [selectedSetIds, setSelectedSetIds] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [loadedPresetSetIds, setLoadedPresetSetIds] = useState<string[]>([]);
  const [expandSignal, setExpandSignal] = useState(0);
  const [collapseSignal, setCollapseSignal] = useState(0);
  const [selectedTest, setSelectedTest] = useState<{
    issueId: string;
    key: string;
    status?: { name: string; color?: string } | null;
  } | null>(null);

  // Dirty detection: preset is "modified" when selection drifts from what was loaded.
  const isModified = useMemo(() => {
    if (!activePresetId) return false;
    const current = [...selectedSetIds].sort().join(",");
    const original = [...loadedPresetSetIds].sort().join(",");
    return current !== original;
  }, [activePresetId, selectedSetIds, loadedPresetSetIds]);

  // Filtered list of test sets for the selector panel.
  const filteredSets = useMemo(() => {
    const q = deferredSetSearch.trim().toLowerCase();
    return (testSets ?? []).filter(
      (ts) =>
        !q || ts.jira.key.toLowerCase().includes(q) || ts.jira.summary.toLowerCase().includes(q),
    );
  }, [testSets, deferredSetSearch]);

  // The ordered list of selected test set objects (preserving display order).
  const selectedSets = useMemo(
    () => (testSets ?? []).filter((ts) => selectedSetIds.has(ts.issue_id)),
    [testSets, selectedSetIds],
  );

  // Fetch tests-with-status for every selected set, windowed to avoid 429s.
  const MAX_CONCURRENT_COVERAGE = 6;
  const coverageSettledRef = useRef(0);

  const testQueries = useQueries({
    queries: selectedSets.map((ts, i) => ({
      queryKey: queryKeys.testSetTestsWithStatus(ts.issue_id),
      queryFn: () => api.getTestSetTestsWithStatus(ts.issue_id),
      enabled: i < coverageSettledRef.current + MAX_CONCURRENT_COVERAGE,
      staleTime: 10 * 60 * 1_000,
      gcTime: Infinity,
      meta: { persist: true },
    })),
  });

  // Advance the concurrency window as queries settle.
  coverageSettledRef.current = testQueries.filter((q) => q.isSuccess || q.isError).length;

  const queryBySetId = useMemo(() => {
    const map = new Map<
      string,
      {
        tests: XrayTestWithStatus[] | undefined;
        isLoading: boolean;
        isFetching: boolean;
        isError: boolean;
        error: unknown;
      }
    >();
    selectedSets.forEach((ts, i) => {
      const q = testQueries[i];
      map.set(ts.issue_id, {
        tests: q?.data,
        isLoading: q?.isLoading ?? false,
        isFetching: q?.isFetching ?? false,
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

  // All queries are "settled" when none are still loading/fetching.
  const allQueriesSettled = useMemo(
    () =>
      testQueries.length > 0 &&
      testQueries.every((q) => !q.isLoading && !q.isFetching && !q.isError),
    [testQueries],
  );

  // Loading progress for the progress bar.
  const loadedCount = testQueries.filter((q) => q.isSuccess && !q.isFetching).length;
  const fetchingCount = testQueries.filter((q) => q.isFetching).length;
  const initialLoadingCount = testQueries.filter((q) => q.isLoading).length;
  const totalCount = selectedSets.length;
  const isAnyLoading = totalCount > 0 && !allQueriesSettled;
  const isBackgroundRefresh = isAnyLoading && initialLoadingCount === 0;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetchSets();
    setIsRefreshing(false);
  };

  const [isRefetchingResults, setIsRefetchingResults] = useState(false);
  const [coverageTab, setCoverageTab] = useState<"coverage" | "analysis">("coverage");

  const handleRefetchResults = async () => {
    if (selectedSets.length === 0) return;
    setIsRefetchingResults(true);
    await Promise.all(
      selectedSets.map((ts) =>
        queryClient.refetchQueries({
          queryKey: queryKeys.testSetTestsWithStatus(ts.issue_id),
        }),
      ),
    );
    setIsRefetchingResults(false);
  };

  const handleExportPDF = async () => {
    if (selectedSets.length === 0) return;
    const path = await saveDialog({
      title: "Save coverage report",
      defaultPath: `coverage-${projectKey}-${new Date().toISOString().slice(0, 10)}.html`,
      filters: [{ name: "HTML Report", extensions: ["html"] }],
    });
    if (!path) return;
    setIsExporting(true);
    try {
      const html = buildCoverageHTML(selectedSets, queryBySetId, projectKey!);
      await api.writeTextFile(path, html);
      await openPath(path);
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
                      <p className="mt-0.5 font-mono text-[10px] leading-tight text-slate-400">
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
      <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-hidden">
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
          {/* Refetch results */}
          {selectedSets.length > 0 && (
            <button
              onClick={() => void handleRefetchResults()}
              disabled={isRefetchingResults}
              className="ml-auto flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:bg-slate-700"
              title="Refetch latest results for selected test sets"
            >
              {isRefetchingResults ? (
                <Spinner size="sm" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Refetch results
            </button>
          )}
          {/* PDF Export */}
          {selectedSets.length > 0 && (
            <button
              onClick={() => void handleExportPDF()}
              disabled={isExporting || !allQueriesSettled}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:bg-slate-700"
              title={
                !allQueriesSettled
                  ? "Wait for all tests to finish loading"
                  : "Export coverage report — opens in browser for printing to PDF"
              }
            >
              {isExporting ? (
                <Spinner size="sm" />
              ) : !allQueriesSettled ? (
                <Download className="h-3.5 w-3.5 animate-pulse" />
              ) : (
                <FileText className="h-3.5 w-3.5" />
              )}
              Export PDF
            </button>
          )}
        </div>

        {/* Tab bar */}
        {selectedSets.length > 0 && (
          <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-700">
            {(["coverage", "analysis"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setCoverageTab(tab)}
                className={cn(
                  "px-4 py-2 text-sm font-medium capitalize transition-colors",
                  coverageTab === tab
                    ? "border-b-2 border-slate-800 text-slate-900 dark:border-slate-300 dark:text-slate-100"
                    : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200",
                )}
              >
                {tab}
              </button>
            ))}
          </div>
        )}

        {selectedSets.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-slate-400 dark:text-slate-500">
            <Layers className="h-12 w-12 opacity-30" />
            <p className="text-sm">Select test sets on the left to view coverage.</p>
          </div>
        )}

        {/* Loading progress bar */}
        {isAnyLoading && (
          <div className={cn(
            "flex items-center gap-3 rounded-lg border px-4 py-2",
            isBackgroundRefresh
              ? "border-emerald-100 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30"
              : "border-blue-100 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/30",
          )}>
            <Spinner size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <p className={cn(
                  "text-xs font-medium",
                  isBackgroundRefresh
                    ? "text-emerald-700 dark:text-emerald-300"
                    : "text-blue-700 dark:text-blue-300",
                )}>
                  {isBackgroundRefresh ? "Refreshing cached data…" : "Loading test set data…"}{" "}
                  <span className="font-semibold">
                    {loadedCount}/{totalCount}
                  </span>
                  {fetchingCount > 0 && (
                    <span className={cn(
                      "ml-1 font-normal",
                      isBackgroundRefresh
                        ? "text-emerald-500 dark:text-emerald-400"
                        : "text-blue-500 dark:text-blue-400",
                    )}>
                      ({fetchingCount} in progress)
                    </span>
                  )}
                </p>
              </div>
              <div className={cn(
                "mt-1.5 h-1.5 w-full overflow-hidden rounded-full",
                isBackgroundRefresh
                  ? "bg-emerald-100 dark:bg-emerald-900/50"
                  : "bg-blue-100 dark:bg-blue-900/50",
              )}>
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500 ease-out",
                    isBackgroundRefresh
                      ? "bg-emerald-500 dark:bg-emerald-400"
                      : "bg-blue-500 dark:bg-blue-400",
                  )}
                  style={{ width: `${totalCount > 0 ? (loadedCount / totalCount) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {selectedSets.length > 0 && coverageTab === "coverage" && (
          <>
            {/* Coverage tab toolbar */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative ml-auto w-48 shrink-0">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <Input
                  className="pl-8 text-xs"
                  placeholder="Filter tests…"
                  value={testSearch}
                  onChange={(e) => setTestSearch(e.target.value)}
                />
              </div>
              {selectedSets.length > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setExpandSignal((n) => n + 1)}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                    title="Expand all test sets"
                  >
                    <ChevronsDown className="h-3.5 w-3.5" />
                    Expand all
                  </button>
                  <button
                    onClick={() => setCollapseSignal((n) => n + 1)}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                    title="Collapse all test sets"
                  >
                    <ChevronsUp className="h-3.5 w-3.5" />
                    Collapse all
                  </button>
                </div>
              )}
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto pb-4">
              <OverallDashboard
                allTests={allTests}
                selectedCount={selectedSets.length}
                queryBySetId={queryBySetId}
              />
              {selectedSets.map((ts) => {
                const q = queryBySetId.get(ts.issue_id);
                return (
                  <TestSetSection
                    key={ts.issue_id}
                    testSet={ts}
                    tests={q?.tests}
                    isLoading={q?.isLoading ?? false}
                    isFetching={q?.isFetching ?? false}
                    isError={q?.isError ?? false}
                    error={q?.error}
                    onRetry={() =>
                      void queryClient.refetchQueries({
                        queryKey: queryKeys.testSetTestsWithStatus(ts.issue_id),
                      })
                    }
                    testSearch={deferredTestSearch}
                    statusFilter={null}
                    expandSignal={expandSignal}
                    collapseSignal={collapseSignal}
                    onTestClick={(test) =>
                      setSelectedTest({
                        issueId: test.issue_id,
                        key: test.jira.key,
                        status: test.latest_status ?? null,
                      })
                    }
                  />
                );
              })}
            </div>
          </>
        )}

        {selectedSets.length > 0 && coverageTab === "analysis" && (
          <div className="flex-1 space-y-4 overflow-y-auto pb-4">
            <InsightsPanel
              allTests={allTests}
              selectedSets={selectedSets}
              queryBySetId={queryBySetId}
            />
            <FailureConcentrationPanel
              selectedSets={selectedSets}
              queryBySetId={queryBySetId}
            />
            <NeverRunPanel
              selectedSets={selectedSets}
              queryBySetId={queryBySetId}
            />
          </div>
        )}
      </div>

      {/* Test detail modal */}
      {selectedTest && (
        <CoverageTestDetailModal
          testIssueId={selectedTest.issueId}
          testKey={selectedTest.key}
          projectKey={projectKey}
          coverageStatus={selectedTest.status}
          onClose={() => setSelectedTest(null)}
        />
      )}
    </div>
  );
}

export default CoveragePage;
