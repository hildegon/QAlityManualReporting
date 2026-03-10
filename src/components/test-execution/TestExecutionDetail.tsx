import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StepMarkdown } from "./StepMarkdown";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useQueryClient } from "@tanstack/react-query";
import {
  useTestRuns,
  useUpdateTestRunStatus,
  useUpdateTestRunComment,
  useUpdateTestRunStepStatus,
  useUpdateTestRunStep,
  useXrayStatuses,
  useStepStatuses,
  useTestSetMembership,
  useGetTests,
  useGetTestSets,
  useAddTestsToTestExecution,
  queryKeys,
} from "@/services/queries";
import * as api from "@/services/tauri";
import { parseRateLimitError } from "@/stores/uiStore";
import { buildSlicesFromCounts } from "@/components/charts/StatusCharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge, statusVariant } from "@/components/ui/badge";
import { cn } from "@/components/ui/utils";
import {
  ArrowLeft,
  ArrowUpDown,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Layers,
  Loader2,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  X,
} from "lucide-react";
import type {
  CucumberResult,
  TestExecution,
  TestRun,
  TestRunStep,
  XrayStepStatus,
  XrayTestRunStatus,
} from "@/types";

interface TestExecutionDetailProps {
  execution: TestExecution;
  onBack: () => void;
  /** Project key used to fetch test sets for the filter (content project key). */
  contentProjectKey?: string | null;
}

/** Returns an inline style object for a status button given an optional hex color. */
function statusButtonStyle(color: string | undefined, isActive: boolean): React.CSSProperties {
  if (!color) return {};
  return isActive
    ? { backgroundColor: color, color: "#fff", borderColor: color }
    : { backgroundColor: `${color}22`, color, borderColor: `${color}55` };
}

/** Fallback status names shown while Xray statuses are loading. */
const FALLBACK_STATUSES: XrayTestRunStatus[] = [
  { name: "TODO" },
  { name: "EXECUTING" },
  { name: "PASS" },
  { name: "FAIL" },
  { name: "BLOCKED" },
];

const FALLBACK_STEP_STATUSES: XrayStepStatus[] = [
  { name: "TODO" },
  { name: "PASS" },
  { name: "FAIL" },
];

/** Sentinel value meaning "show all runs regardless of test set". */
const FILTER_ALL = "__all__";
/** Sentinel value meaning "show only runs whose test is in no test set". */
const FILTER_NONE = "__none__";

/**
 * Status sort priority — lower number = shown first.
 * Unrecognised statuses sort after all known ones.
 */
const STATUS_SORT_ORDER: Record<string, number> = {
  FAIL: 0,
  FAILED: 0,
  BLOCKED: 1,
  EXECUTING: 2,
  TODO: 3,
  PASS: 4,
  PASSED: 4,
};

export function TestExecutionDetail({
  execution,
  onBack,
  contentProjectKey,
}: TestExecutionDetailProps) {
  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useTestRuns(execution.issue_id);
  const { data: xrayStatuses } = useXrayStatuses(execution.project_id);
  const { data: xrayStepStatuses } = useStepStatuses(execution.project_id);
  const updateStatus = useUpdateTestRunStatus();
  const updateComment = useUpdateTestRunComment();
  const updateStepStatus = useUpdateTestRunStepStatus();
  const updateStep = useUpdateTestRunStep();
  const addTests = useAddTestsToTestExecution();
  const queryClient = useQueryClient();

  // Test-set membership data for the filter
  const { testSets, membership } = useTestSetMembership(contentProjectKey ?? null);

  const [activeComment, setActiveComment] = useState<string | null>(null);
  const [commentValue, setCommentValue] = useState("");
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());
  const [testSetFilter, setTestSetFilter] = useState<string>(FILTER_ALL);
  const [testSearch, setTestSearch] = useState("");
  const [sortByStatus, setSortByStatus] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  /** Status name to filter by, or null to show all. */
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  // ── Add-tests panel state ──────────────────────────────────────────────────
  const [addPanelOpen, setAddPanelOpen] = useState(false);
  /** "sets" | "tests" tab inside the add panel */
  const [addTab, setAddTab] = useState<"sets" | "tests">("sets");
  const [addSetSearch, setAddSetSearch] = useState("");
  const [addTestSearch, setAddTestSearch] = useState("");
  const [selectedTestIds, setSelectedTestIds] = useState<Set<string>>(new Set());
  /** issueId of the test set currently being expanded into selectedTestIds */
  const [loadingSetId, setLoadingSetId] = useState<string | null>(null);

  // Only fetch tests/sets when the panel is open to avoid unnecessary calls.
  const { data: allTests, isLoading: testsLoading } = useGetTests(
    addPanelOpen ? (contentProjectKey ?? undefined) : undefined,
  );
  const { data: allTestSets, isLoading: testSetsLoading } = useGetTestSets(
    addPanelOpen ? (contentProjectKey ?? undefined) : undefined,
  );

  const filteredAddSets = useMemo(() => {
    const q = addSetSearch.trim().toLowerCase();
    return (allTestSets ?? []).filter(
      (ts) =>
        !q || ts.jira.key.toLowerCase().includes(q) || ts.jira.summary.toLowerCase().includes(q),
    );
  }, [allTestSets, addSetSearch]);

  const filteredAddTests = useMemo(() => {
    const q = addTestSearch.trim().toLowerCase();
    return (allTests ?? []).filter(
      (t) => !q || t.jira.key.toLowerCase().includes(q) || t.jira.summary.toLowerCase().includes(q),
    );
  }, [allTests, addTestSearch]);

  const toggleSelectedTest = (issueId: string) => {
    setSelectedTestIds((prev) => {
      const next = new Set(prev);
      if (next.has(issueId)) {
        next.delete(issueId);
      } else {
        next.add(issueId);
      }
      return next;
    });
  };

  /** Fetch all tests in a set and add them to selectedTestIds. */
  const handleSelectFromSet = useCallback(
    async (setIssueId: string) => {
      setLoadingSetId(setIssueId);
      try {
        const setTests = await queryClient.fetchQuery({
          queryKey: queryKeys.testSetTests(setIssueId),
          queryFn: () => api.getTestSetTests(setIssueId),
          staleTime: 5 * 60 * 1_000,
        });
        setSelectedTestIds((prev) => {
          const next = new Set(prev);
          for (const t of setTests) next.add(t.issue_id);
          return next;
        });
        // Switch to the tests tab so the user sees what got selected.
        setAddTab("tests");
      } catch {
        // silently ignore — button re-enables
      } finally {
        setLoadingSetId(null);
      }
    },
    [queryClient],
  );

  const handleConfirmAddTests = () => {
    if (selectedTestIds.size === 0 || addTests.isPending) return;
    addTests.mutate(
      {
        testExecIssueId: execution.issue_id,
        testIssueIds: [...selectedTestIds],
        executionProjectKey: execution.project_id,
      },
      {
        onSuccess: () => {
          setAddPanelOpen(false);
          setSelectedTestIds(new Set());
          setAddSetSearch("");
          setAddTestSearch("");
          setAddTab("sets");
          addTests.reset();
        },
      },
    );
  };

  // Flatten all pages into a single runs array
  const runs = useMemo(() => data?.pages.flatMap((page) => page.results) ?? [], [data]);

  // Count how many currently-loaded runs belong to each test set.
  // Used for the count badge on each pill; updates automatically as more pages load.
  const testSetCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const run of runs) {
      for (const s of membership.get(run.test.issue_id) ?? []) {
        map.set(s.issueId, (map.get(s.issueId) ?? 0) + 1);
      }
    }
    return map;
  }, [runs, membership]);

  // Apply test-set filter, then text search, then optional status sort.
  const filteredRuns = useMemo(() => {
    let result = runs;

    // 1. Test-set filter
    if (testSetFilter === FILTER_NONE) {
      result = result.filter((r) => !membership.has(r.test.issue_id));
    } else if (testSetFilter !== FILTER_ALL) {
      result = result.filter((r) =>
        membership.get(r.test.issue_id)?.some((s) => s.issueId === testSetFilter),
      );
    }

    // 2. Key / name search
    const q = testSearch.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (r) =>
          r.test.jira.key.toLowerCase().includes(q) ||
          r.test.jira.summary.toLowerCase().includes(q),
      );
    }

    // 3. Status filter
    if (statusFilter) {
      result = result.filter((r) => r.status.name.toUpperCase() === statusFilter.toUpperCase());
    }

    // 4. Status sort (stable — preserves original order within the same status group)
    if (sortByStatus) {
      result = [...result].sort((a, b) => {
        const oa = STATUS_SORT_ORDER[a.status.name.toUpperCase()] ?? 99;
        const ob = STATUS_SORT_ORDER[b.status.name.toUpperCase()] ?? 99;
        return oa - ob;
      });
    }

    return result;
  }, [runs, testSetFilter, membership, testSearch, sortByStatus, statusFilter]);

  // Total count from the server (available from the first page)
  const totalFromServer = data?.pages[0]?.total ?? 0;

  const statuses: XrayTestRunStatus[] =
    xrayStatuses && xrayStatuses.length > 0 ? xrayStatuses : FALLBACK_STATUSES;

  const stepStatuses: XrayStepStatus[] =
    xrayStepStatuses && xrayStepStatuses.length > 0 ? xrayStepStatuses : FALLBACK_STEP_STATUSES;

  const toggleExpanded = (runId: string) => {
    setExpandedRuns((prev) => {
      const next = new Set(prev);
      if (next.has(runId)) {
        next.delete(runId);
      } else {
        next.add(runId);
      }
      return next;
    });
  };

  const virtualizer = useVirtualizer({
    count: filteredRuns.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 10,
    // Use the run id as the stable measurement key so the virtualizer
    // doesn't reuse a cached height from a different run when the list
    // reorders (e.g. after a bulk-status update with sort-by-status on).
    getItemKey: (index) => filteredRuns[index]?.id ?? index,
  });

  // Track only the ordered list of run IDs (not their data) so we can
  // distinguish a structural change (reorder / add / remove) from a
  // data-only refresh (status / step update).  We join them into a single
  // string so the comparison is a fast reference-equal check on the memo.
  const filteredRunKeys = useMemo(() => filteredRuns.map((r) => r.id).join(","), [filteredRuns]);

  // Only force a full height recomputation when the list structure actually
  // changes (items added, removed, or reordered).  Skipping this on pure
  // data refreshes prevents the virtualizer from resetting cached heights for
  // expanded rows, which was the cause of the "ghost steps" visual glitch.
  useEffect(() => {
    virtualizer.measure();
  }, [filteredRunKeys, virtualizer]);

  // Auto-load next page when the user scrolls near the bottom
  const virtualItems = virtualizer.getVirtualItems();
  useEffect(() => {
    const lastItem = virtualItems[virtualItems.length - 1];
    if (!lastItem) return;

    // If the last visible item is within 5 rows of the end, fetch more
    if (lastItem.index >= runs.length - 5 && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [virtualItems, hasNextPage, isFetchingNextPage, runs.length, fetchNextPage]);

  // No automatic background prefetch — pagination is scroll-driven only.
  // Users can click "Load all" in the footer when they need complete data
  // (e.g. for test-set filter accuracy on large executions).

  const handleStatusChange = (run: TestRun, newStatus: string) => {
    updateStatus.mutate({
      testRunId: run.id,
      status: newStatus,
      executionIssueId: execution.issue_id,
    });
  };

  const handleStepStatusChange = (run: TestRun, step: TestRunStep, newStatus: string) => {
    updateStepStatus.mutate({
      testRunId: run.id,
      stepId: step.id,
      status: newStatus,
      executionIssueId: execution.issue_id,
    });
  };

  const handleSaveComment = (run: TestRun) => {
    updateComment.mutate({
      testRunId: run.id,
      comment: commentValue,
      executionIssueId: execution.issue_id,
    });
    setActiveComment(null);
    setCommentValue("");
  };

  const handleSaveStepField = useCallback(
    (run: TestRun, step: TestRunStep, field: "comment" | "actualResult", value: string) => {
      updateStep.mutate({
        testRunId: run.id,
        stepId: step.id,
        [field]: value,
        executionIssueId: execution.issue_id,
      });
    },
    [updateStep, execution.issue_id],
  );

  // ── Bulk operations ─────────────────────────────────────────────────────────

  const handleBulkStepStatus = (run: TestRun, newStatus: string) => {
    if (!run.steps) return;
    for (const step of run.steps) {
      if (step.status?.name?.toUpperCase() !== newStatus.toUpperCase()) {
        updateStepStatus.mutate({
          testRunId: run.id,
          stepId: step.id,
          status: newStatus,
          executionIssueId: execution.issue_id,
        });
      }
    }
  };

  // ── Add-tests panel JSX (reused in both empty state and toolbar) ─────────────
  const addTestsPanel = addPanelOpen ? (
    <div className="rounded-lg border border-blue-200 bg-blue-50 shadow-sm dark:border-blue-800 dark:bg-blue-950/40">
      {/* Panel header */}
      <div className="flex items-center justify-between border-b border-blue-200 px-4 py-2.5 dark:border-blue-800">
        <span className="text-sm font-medium text-blue-900 dark:text-blue-200">
          Add tests to execution
        </span>
        <button
          onClick={() => {
            setAddPanelOpen(false);
            setSelectedTestIds(new Set());
            setAddSetSearch("");
            setAddTestSearch("");
            setAddTab("sets");
            addTests.reset();
          }}
          className="rounded p-0.5 text-blue-400 hover:bg-blue-100 hover:text-blue-600 dark:hover:bg-blue-900"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-blue-200 dark:border-blue-800">
        {(["sets", "tests"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setAddTab(tab)}
            className={cn(
              "px-4 py-2 text-xs font-medium transition-colors",
              addTab === tab
                ? "border-b-2 border-blue-600 text-blue-700 dark:text-blue-300"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200",
            )}
          >
            {tab === "sets" ? "From Test Set" : "Individual Tests"}
            {tab === "tests" && selectedTestIds.size > 0 && (
              <span className="ml-1.5 rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] text-white">
                {selectedTestIds.size}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="p-4">
        {/* ── From Test Set tab ── */}
        {addTab === "sets" && (
          <div className="space-y-2">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Select a test set to add all its tests to this execution.
            </p>
            <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 dark:border-slate-600 dark:bg-slate-800">
              <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <input
                type="text"
                placeholder="Filter test sets…"
                value={addSetSearch}
                onChange={(e) => setAddSetSearch(e.target.value)}
                className="flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none dark:text-slate-200"
              />
              {addSetSearch && (
                <button
                  onClick={() => setAddSetSearch("")}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {testSetsLoading ? (
              <div className="flex items-center gap-2 py-3 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading test sets…
              </div>
            ) : (
              <div className="max-h-48 overflow-y-auto rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                {filteredAddSets.length === 0 ? (
                  <p className="px-3 py-4 text-center text-sm text-slate-400">
                    {addSetSearch ? "No test sets match." : "No test sets found."}
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                    {filteredAddSets.map((ts) => {
                      const isLoading = loadingSetId === ts.issue_id;
                      return (
                        <li
                          key={ts.issue_id}
                          className="flex items-center justify-between gap-3 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <span className="mr-1.5 font-mono text-xs text-slate-500">
                              {ts.jira.key}
                            </span>
                            <span className="text-sm text-slate-800 dark:text-slate-200">
                              {ts.jira.summary}
                            </span>
                          </div>
                          <button
                            disabled={isLoading || loadingSetId !== null}
                            onClick={() => void handleSelectFromSet(ts.issue_id)}
                            className="flex shrink-0 items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300"
                          >
                            {isLoading ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Plus className="h-3 w-3" />
                            )}
                            Select
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Individual Tests tab ── */}
        {addTab === "tests" && (
          <div className="space-y-2">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Check tests to add them individually.
            </p>
            <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 dark:border-slate-600 dark:bg-slate-800">
              <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <input
                type="text"
                placeholder="Search by key or summary…"
                value={addTestSearch}
                onChange={(e) => setAddTestSearch(e.target.value)}
                className="flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none dark:text-slate-200"
              />
              {addTestSearch && (
                <button
                  onClick={() => setAddTestSearch("")}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {testsLoading ? (
              <div className="flex items-center gap-2 py-3 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading tests…
              </div>
            ) : (
              <div className="max-h-48 overflow-y-auto rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                {filteredAddTests.length === 0 ? (
                  <p className="px-3 py-4 text-center text-sm text-slate-400">
                    {addTestSearch ? "No tests match." : "No tests found."}
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                    {filteredAddTests.map((test) => {
                      const checked = selectedTestIds.has(test.issue_id);
                      return (
                        <li key={test.issue_id}>
                          <label className="flex cursor-pointer items-start gap-3 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/40">
                            <input
                              type="checkbox"
                              className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600"
                              checked={checked}
                              onChange={() => toggleSelectedTest(test.issue_id)}
                            />
                            <div className="min-w-0">
                              <span className="mr-1.5 font-mono text-xs text-slate-500">
                                {test.jira.key}
                              </span>
                              <span className="text-sm text-slate-800 dark:text-slate-200">
                                {test.jira.summary}
                              </span>
                            </div>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {addTests.isError && (
          <div className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
            Failed to add tests: {String(addTests.error)}
          </div>
        )}

        {/* Footer */}
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {selectedTestIds.size > 0
              ? `${selectedTestIds.size} test${selectedTestIds.size !== 1 ? "s" : ""} selected`
              : "No tests selected"}
          </span>
          <div className="flex gap-2">
            {selectedTestIds.size > 0 && (
              <button
                onClick={() => setSelectedTestIds(new Set())}
                className="rounded border border-slate-200 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400"
              >
                Clear
              </button>
            )}
            <Button
              size="sm"
              disabled={selectedTestIds.size === 0 || addTests.isPending}
              onClick={handleConfirmAddTests}
            >
              {addTests.isPending ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Adding…
                </>
              ) : (
                <>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add {selectedTestIds.size > 0 ? selectedTestIds.size : ""} test
                  {selectedTestIds.size !== 1 ? "s" : ""}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  // ── Progress summary (over filtered runs) ──────────────────────────────────
  const total = filteredRuns.length;
  const rawCounts = filteredRuns.reduce<Record<string, number>>((acc, run) => {
    const name = run.status.name.toUpperCase();
    acc[name] = (acc[name] ?? 0) + 1;
    return acc;
  }, {});
  // buildSlicesFromCounts merges aliases (PASSED→PASS, NOT RUN→TODO, etc.) and
  // keeps N/A and any other custom status as its own distinct slice.
  const summarySlices = buildSlicesFromCounts(rawCounts, total);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-4 flex items-start gap-3">
        <button
          onClick={onBack}
          className="mt-0.5 rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700"
          aria-label="Back to executions"
        >
          <ArrowLeft className="h-4 w-4 text-slate-500" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">{execution.jira.summary}</h1>
          <p className="mt-0.5 font-mono text-xs text-slate-400">{execution.jira.key}</p>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex flex-col gap-2">
          {/* Filter/toolbar skeleton */}
          <div className="flex items-center gap-2 pb-1">
            <Skeleton className="h-8 flex-1" />
            <Skeleton className="h-8 w-28" />
          </div>
          {/* Test run row skeletons: key + summary + status chips */}
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded border border-slate-100 px-3 py-2.5"
            >
              <Skeleton className="h-4 w-4 shrink-0 rounded" />
              <Skeleton className="h-4 w-20 shrink-0" />
              <Skeleton className="h-4 flex-1" />
              <div className="flex gap-1">
                {Array.from({ length: 4 }).map((__, j) => (
                  <Skeleton key={j} className="h-6 w-14 rounded-full" />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {isError &&
        (() => {
          const rateLimitUntil = parseRateLimitError(error);
          if (rateLimitUntil !== null) {
            const seconds = Math.max(0, Math.ceil((rateLimitUntil - Date.now()) / 1_000));
            return (
              <div className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                <p className="font-medium">Rate limited by Xray</p>
                <p className="mt-0.5 text-xs">
                  Too many requests. Please wait{seconds > 0 ? ` ~${seconds}s` : ""} and try again.
                </p>
              </div>
            );
          }
          return (
            <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              <p className="mb-1 font-medium">Failed to load test runs</p>
              <pre className="whitespace-pre-wrap break-words font-mono text-xs">
                {String(error)}
              </pre>
            </div>
          );
        })()}

      {/* Empty state */}
      {!isLoading && !isError && runs.length === 0 && (
        <div className="flex h-48 flex-col items-center justify-center gap-3 text-slate-400">
          <ClipboardList className="h-10 w-10 opacity-40" />
          <p className="text-sm">No test runs in this execution.</p>
          <button
            onClick={() => setAddPanelOpen((prev) => !prev)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium shadow-sm transition-colors",
              addPanelOpen
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:bg-slate-700",
            )}
          >
            <Plus className="h-3.5 w-3.5" />
            Add tests
          </button>
          {addTestsPanel}
        </div>
      )}

      {runs.length > 0 && (
        <>
          {/* Filters */}
          <div className="mb-3 space-y-2">
            {/* Test set filter — pill buttons.
                Hide the panel entirely once all pages are loaded and no set overlaps
                with this execution (testSetCounts is empty). */}
            {testSets.length > 0 &&
              (hasNextPage || isFetchingNextPage || testSetCounts.size > 0) && (
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Test Set
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {/* "All" pill */}
                    <button
                      onClick={() => setTestSetFilter(FILTER_ALL)}
                      className={cn(
                        "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                        testSetFilter === FILTER_ALL
                          ? "border-slate-800 bg-slate-800 text-white"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:bg-slate-700",
                      )}
                    >
                      All ({runs.length})
                    </button>

                    {/* "No set" pill — only when some runs have no set */}
                    {(() => {
                      const noSetCount = runs.filter(
                        (r) => !membership.has(r.test.issue_id),
                      ).length;
                      return noSetCount > 0 ? (
                        <button
                          onClick={() => setTestSetFilter(FILTER_NONE)}
                          className={cn(
                            "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                            testSetFilter === FILTER_NONE
                              ? "border-slate-800 bg-slate-800 text-white"
                              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:bg-slate-700",
                          )}
                        >
                          No set ({noSetCount})
                        </button>
                      ) : null;
                    })()}

                    {/* One pill per test set that has at least one run in this execution.
                      While pages are still loading we keep every set visible so pills
                      don't disappear mid-load; once all pages are fetched the count
                      is definitive and zero-count sets are hidden. */}
                    {testSets.map((ts) => {
                      const count = testSetCounts.get(ts.issue_id) ?? 0;
                      if (count === 0 && !hasNextPage && !isFetchingNextPage) return null;
                      const isActive = testSetFilter === ts.issue_id;
                      return (
                        <button
                          key={ts.issue_id}
                          title={`${ts.jira.key} — ${ts.jira.summary}`}
                          onClick={() =>
                            setTestSetFilter((prev) =>
                              prev === ts.issue_id ? FILTER_ALL : ts.issue_id,
                            )
                          }
                          className={cn(
                            "max-w-[18rem] truncate rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                            isActive
                              ? "border-slate-800 bg-slate-800 text-white"
                              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:bg-slate-700",
                          )}
                        >
                          {ts.jira.summary} ({count})
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

            {/* Key / name search + sort toggle + add tests */}
            <div className="flex items-center gap-2">
              <div className="flex flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter by key or name…"
                  value={testSearch}
                  onChange={(e) => setTestSearch(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none dark:text-slate-200 dark:placeholder:text-slate-500"
                />
                {testSearch && (
                  <button
                    onClick={() => setTestSearch("")}
                    className="text-slate-400 hover:text-slate-600"
                    aria-label="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <button
                onClick={() => setSortByStatus((prev) => !prev)}
                title={sortByStatus ? "Restore original order" : "Sort by status"}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium shadow-sm transition-colors",
                  sortByStatus
                    ? "border-slate-800 bg-slate-800 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:bg-slate-700",
                )}
              >
                <ArrowUpDown className="h-3.5 w-3.5" />
                Status
              </button>
              <button
                onClick={() => setAddPanelOpen((prev) => !prev)}
                title="Add tests to this execution"
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium shadow-sm transition-colors",
                  addPanelOpen
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:bg-slate-700",
                )}
              >
                <Plus className="h-3.5 w-3.5" />
                Add tests
              </button>
            </div>

            {/* ── Add-tests panel ────────────────────────────────────────────── */}
            {addTestsPanel}
          </div>

          {/* Progress summary */}
          <div className="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="mb-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span className="font-medium">
                {total}
                {totalFromServer > total ? ` of ${totalFromServer}` : ""} test
                {totalFromServer !== 1 ? "s" : ""}
              </span>
              <span className="text-slate-400">
                {summarySlices.map((sl, i) => (
                  <span key={sl.key}>
                    {i > 0 && " · "}
                    <span style={{ color: sl.color }}>{sl.count}</span> {sl.label.toLowerCase()}
                  </span>
                ))}
              </span>
            </div>
            {/* Progress bar — one segment per status, each coloured by its palette entry */}
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
              {summarySlices.map((sl) =>
                sl.count > 0 ? (
                  <div
                    key={sl.key}
                    style={{ width: `${sl.pct * 100}%`, backgroundColor: sl.color }}
                  />
                ) : null,
              )}
            </div>
          </div>

          {/* Status filter */}
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Filter:</span>
            {statuses.map((s) => {
              const isActive = statusFilter?.toUpperCase() === s.name.toUpperCase();
              return (
                <button
                  key={s.name}
                  title={isActive ? `Clear filter: ${s.name}` : `Show only ${s.name}`}
                  onClick={() =>
                    setStatusFilter((prev) =>
                      prev?.toUpperCase() === s.name.toUpperCase() ? null : s.name,
                    )
                  }
                  style={statusButtonStyle(s.color, isActive)}
                  className={cn(
                    "rounded border px-2 py-0.5 text-xs font-medium transition-colors",
                    !s.color && isActive
                      ? "border-slate-600 bg-slate-600 text-white"
                      : !s.color
                        ? "border-transparent bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                        : "",
                  )}
                >
                  {s.name}
                </button>
              );
            })}
            {statusFilter && (
              <button
                onClick={() => setStatusFilter(null)}
                className="ml-1 text-slate-400 hover:text-slate-600"
                title="Clear filter"
                aria-label="Clear status filter"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
            {/* Table header */}
            <div className="grid grid-cols-[auto_2fr_1fr_auto_auto] gap-4 border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-700/60 dark:text-slate-400">
              <span className="w-5"></span>
              <span>Test</span>
              <span>Status</span>
              <span>Update status</span>
              <span></span>
            </div>

            {/* Virtualised rows */}
            <div ref={parentRef} className="overflow-auto" style={{ height: 600 }}>
              <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
                {virtualItems.map((virtualRow) => {
                  const run = filteredRuns[virtualRow.index];
                  if (!run) return null;

                  const hasManualSteps = (run.steps?.length ?? 0) > 0;
                  const isCucumber =
                    run.test_type?.name?.toLowerCase() === "cucumber" || !!run.gherkin;
                  const hasSteps = hasManualSteps || isCucumber;
                  const isExpanded = expandedRuns.has(run.id);

                  return (
                    <div
                      key={run.id}
                      data-index={virtualRow.index}
                      ref={virtualizer.measureElement}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <div className="grid grid-cols-[auto_2fr_1fr_auto_auto] items-center gap-4 border-b border-slate-50 px-4 py-3 last:border-0 hover:bg-slate-50/50 dark:border-slate-700 dark:hover:bg-slate-700/40">
                        {/* Expand toggle */}
                        <button
                          onClick={() => hasSteps && toggleExpanded(run.id)}
                          className={cn(
                            "flex h-5 w-5 items-center justify-center rounded",
                            hasSteps
                              ? "text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
                              : "cursor-default text-transparent",
                          )}
                          aria-label={isExpanded ? "Collapse steps" : "Expand steps"}
                          tabIndex={hasSteps ? 0 : -1}
                          onKeyDown={(e) => {
                            if (hasSteps && (e.key === "Enter" || e.key === " ")) {
                              e.preventDefault();
                              toggleExpanded(run.id);
                            }
                          }}
                        >
                          {hasSteps &&
                            (isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            ))}
                        </button>

                        {/* Test identity */}
                        <div className="min-w-0">
                          <p className="truncate text-sm text-slate-800 dark:text-slate-200">
                            {run.test.jira.summary}
                          </p>
                          <p className="font-mono text-xs text-slate-400">
                            {run.test.jira.key}
                            {hasSteps && (
                              <span className="ml-2 text-slate-300 dark:text-slate-600">
                                {isCucumber
                                  ? "Cucumber"
                                  : `${run.steps!.length} step${run.steps!.length !== 1 ? "s" : ""}`}
                              </span>
                            )}
                          </p>
                        </div>

                        {/* Current status */}
                        <Badge variant={statusVariant(run.status.name)}>{run.status.name}</Badge>

                        {/* Status quick-actions (dynamic) */}
                        <div className="flex flex-wrap items-center gap-1">
                          {statuses.map((s) => {
                            const isActive = run.status.name.toUpperCase() === s.name.toUpperCase();
                            return (
                              <button
                                key={s.name}
                                title={s.description ?? s.name}
                                disabled={updateStatus.isPending}
                                onClick={() => handleStatusChange(run, s.name)}
                                style={statusButtonStyle(s.color, isActive)}
                                className={cn(
                                  "rounded border px-2 py-0.5 text-xs font-medium transition-colors",
                                  !s.color &&
                                    (isActive
                                      ? "border-transparent bg-slate-800 text-white"
                                      : "border-transparent bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"),
                                )}
                              >
                                {s.name}
                              </button>
                            );
                          })}
                        </div>

                        {/* Comment toggle */}
                        <button
                          title={run.comment ? `Comment: ${run.comment}` : "Add comment"}
                          onClick={() => {
                            if (activeComment === run.id) {
                              setActiveComment(null);
                            } else {
                              setActiveComment(run.id);
                              setCommentValue(run.comment ?? "");
                            }
                          }}
                          className={cn(
                            "rounded p-1 hover:bg-slate-100",
                            run.comment
                              ? "text-blue-500 hover:text-blue-700"
                              : "text-slate-400 hover:text-slate-700",
                          )}
                        >
                          <MessageSquare className="h-4 w-4" />
                        </button>
                      </div>

                      {/* Inline comment editor */}
                      {activeComment === run.id && (
                        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2 dark:border-slate-700 dark:bg-slate-700/40">
                          <input
                            autoFocus
                            className="flex-1 rounded border border-slate-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:focus:ring-slate-500"
                            placeholder="Add a comment..."
                            value={commentValue}
                            onChange={(e) => setCommentValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveComment(run);
                              if (e.key === "Escape") setActiveComment(null);
                            }}
                          />
                          <Button
                            size="sm"
                            disabled={updateComment.isPending}
                            onClick={() => handleSaveComment(run)}
                          >
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setActiveComment(null)}>
                            Cancel
                          </Button>
                        </div>
                      )}

                      {/* Expanded steps panel — manual or Cucumber */}
                      {isExpanded && isCucumber && (
                        <GherkinPanel gherkin={run.gherkin} results={run.results} />
                      )}
                      {isExpanded && hasManualSteps && (
                        <StepsPanel
                          run={run}
                          steps={run.steps!}
                          stepStatuses={stepStatuses}
                          onStepStatusChange={(step, status) =>
                            handleStepStatusChange(run, step, status)
                          }
                          onSaveStepField={(step, field, value) =>
                            handleSaveStepField(run, step, field, value)
                          }
                          onBulkStepStatus={(status) => handleBulkStepStatus(run, status)}
                          isPending={updateStepStatus.isPending}
                          isSaving={updateStep.isPending}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer with count + load controls */}
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 text-xs text-slate-400 dark:border-slate-700 dark:text-slate-500">
              <span>
                {filteredRuns.length < runs.length
                  ? `${filteredRuns.length} of ${runs.length}`
                  : runs.length < totalFromServer
                    ? `${runs.length} of ${totalFromServer}`
                    : runs.length}{" "}
                test{totalFromServer !== 1 ? "s" : ""}
              </span>
              {hasNextPage && (
                <div className="flex items-center gap-2">
                  {/* Load next page */}
                  <button
                    onClick={() => void fetchNextPage()}
                    disabled={isFetchingNextPage || loadingAll}
                    className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-700"
                  >
                    {isFetchingNextPage && !loadingAll ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Loading…
                      </>
                    ) : (
                      "Load more"
                    )}
                  </button>

                  {/* Load all remaining pages — throttled to avoid 429s */}
                  <button
                    onClick={() => {
                      setLoadingAll(true);
                      const pump = () => {
                        void fetchNextPage().then(({ hasNextPage: more }) => {
                          if (more) {
                            setTimeout(pump, 400);
                          } else {
                            setLoadingAll(false);
                          }
                        });
                      };
                      pump();
                    }}
                    disabled={isFetchingNextPage || loadingAll}
                    className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-700"
                  >
                    {loadingAll ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Loading all…
                      </>
                    ) : (
                      `Load all (${totalFromServer - runs.length} remaining)`
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Gherkin Panel ─────────────────────────────────────────────────────────────

/** Keyword → Tailwind colour classes for the keyword chip. */
function gherkinKeywordStyle(keyword: string): string {
  const k = keyword.trim().toLowerCase();
  if (k === "given")
    return "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300";
  if (k === "when") return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300";
  if (k === "then")
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
  return "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400"; // And / But / *
}

/** Keywords that introduce a step line in Gherkin. */
const GHERKIN_KEYWORDS = /^(Given|When|Then|And|But|\*)\s+/i;

interface GherkinPanelProps {
  gherkin: string | undefined;
  results: CucumberResult[] | undefined;
}

type GherkinRow = {
  keyword: string;
  sentence: string;
  status: { name: string; color?: string } | undefined;
  error: string | undefined;
};

function GherkinPanel({ gherkin, results }: GherkinPanelProps) {
  // Parse step lines out of the raw Gherkin definition string.
  const stepLines = (gherkin ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => GHERKIN_KEYWORDS.test(l));

  // Flatten all result steps across all scenarios for status look-up.
  // We match by position: the Nth result step corresponds to the Nth definition step.
  const resultSteps = results?.flatMap((r) => r.steps ?? []) ?? [];

  const hasResults = resultSteps.length > 0;

  // If we have no raw Gherkin string but do have result steps, fall back to those.
  const rows: GherkinRow[] =
    stepLines.length > 0
      ? stepLines.map((line, i): GherkinRow => {
          const match = GHERKIN_KEYWORDS.exec(line);
          const keyword = match ? match[1] : "";
          const sentence = match ? line.slice(match[0].length) : line;
          const rs = resultSteps[i];
          return { keyword: keyword ?? "", sentence, status: rs?.status, error: rs?.error };
        })
      : resultSteps.map(
          (rs): GherkinRow => ({
            keyword: rs.keyword ?? "",
            sentence: rs.name ?? "",
            status: rs.status,
            error: rs.error,
          }),
        );

  if (rows.length === 0 && !hasResults) {
    // No definition and no results yet — show a placeholder.
    return (
      <div className="border-b border-slate-100 bg-slate-50/60 px-6 py-3 dark:border-slate-700 dark:bg-slate-700/40">
        <p className="text-xs text-slate-400 italic">No Gherkin steps available.</p>
      </div>
    );
  }

  return (
    <div className="border-b border-slate-100 bg-slate-50/60 dark:border-slate-700 dark:bg-slate-700/40">
      <div className="px-6 py-2">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Scenario steps ({rows.length})
          </p>
        </div>
        <div className="space-y-1">
          {rows.map((step, index) => (
            <div
              key={index}
              className="rounded-md border border-slate-200 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
            >
              <div className="flex items-start gap-3">
                {/* Keyword chip */}
                {step.keyword && (
                  <span
                    className={cn(
                      "mt-0.5 shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold",
                      gherkinKeywordStyle(step.keyword),
                    )}
                  >
                    {step.keyword}
                  </span>
                )}

                {/* Step text */}
                <p className="min-w-0 flex-1 text-sm text-slate-700 dark:text-slate-300">
                  {step.sentence}
                </p>

                {/* Step status badge (read-only) */}
                {step.status && (
                  <Badge variant={statusVariant(step.status.name)} className="shrink-0 text-[10px]">
                    {step.status.name}
                  </Badge>
                )}
              </div>

              {/* Error detail from test runner */}
              {step.error && (
                <p className="mt-1 pl-[52px] font-mono text-xs text-red-500 whitespace-pre-wrap break-words">
                  {step.error}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Steps Panel ───────────────────────────────────────────────────────────────

interface StepsPanelProps {
  run: TestRun;
  steps: TestRunStep[];
  stepStatuses: XrayStepStatus[];
  onStepStatusChange: (step: TestRunStep, status: string) => void;
  onSaveStepField: (step: TestRunStep, field: "comment" | "actualResult", value: string) => void;
  onBulkStepStatus: (status: string) => void;
  isPending: boolean;
  isSaving: boolean;
}

function StepsPanel({
  steps,
  stepStatuses,
  onStepStatusChange,
  onSaveStepField,
  onBulkStepStatus,
  isPending,
  isSaving,
}: StepsPanelProps) {
  const [editingStep, setEditingStep] = useState<{
    stepId: string;
    field: "comment" | "actualResult";
  } | null>(null);
  const [editValue, setEditValue] = useState("");
  const stepRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const startEditing = (step: TestRunStep, field: "comment" | "actualResult") => {
    setEditingStep({ stepId: step.id, field });
    setEditValue(field === "comment" ? (step.comment ?? "") : (step.actual_result ?? ""));
  };

  const saveAndClose = (step: TestRunStep) => {
    if (editingStep) {
      onSaveStepField(step, editingStep.field, editValue);
      setEditingStep(null);
      setEditValue("");
    }
  };

  const cancelEditing = () => {
    setEditingStep(null);
    setEditValue("");
  };

  // Keyboard navigation between steps
  const handleStepKeyDown = (e: React.KeyboardEvent, index: number) => {
    let targetIndex: number | null = null;
    if (e.key === "ArrowDown" || e.key === "j") {
      targetIndex = Math.min(index + 1, steps.length - 1);
    } else if (e.key === "ArrowUp" || e.key === "k") {
      targetIndex = Math.max(index - 1, 0);
    }
    if (targetIndex !== null && targetIndex !== index) {
      e.preventDefault();
      const targetStep = steps[targetIndex];
      if (targetStep) {
        const el = stepRefs.current.get(targetStep.id);
        el?.focus();
      }
    }
  };

  return (
    <div className="border-b border-slate-100 bg-slate-50/60 dark:border-slate-700 dark:bg-slate-700/40">
      <div className="px-6 py-2">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Steps ({steps.length})
          </p>
          {/* Bulk step actions */}
          <div className="flex items-center gap-1">
            <CheckCheck className="mr-1 h-3 w-3 text-slate-400" />
            {stepStatuses.map((s) => (
              <button
                key={s.name}
                title={`Mark all steps as ${s.name}`}
                onClick={() => onBulkStepStatus(s.name)}
                disabled={isPending}
                style={statusButtonStyle(s.color, false)}
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                  !s.color &&
                    "border-transparent bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600",
                )}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          {steps.map((step, index) => {
            const currentStatus = step.status?.name?.toUpperCase() ?? "";
            const isEditingComment =
              editingStep?.stepId === step.id && editingStep.field === "comment";
            const isEditingActual =
              editingStep?.stepId === step.id && editingStep.field === "actualResult";

            return (
              <div
                key={step.id}
                ref={(el) => {
                  if (el) {
                    stepRefs.current.set(step.id, el);
                  } else {
                    stepRefs.current.delete(step.id);
                  }
                }}
                tabIndex={0}
                role="row"
                aria-label={`Step ${index + 1}: ${step.action ?? "No action"}`}
                onKeyDown={(e) => handleStepKeyDown(e, index)}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:focus:ring-slate-500"
              >
                <div className="flex items-start gap-3">
                  {/* Step number */}
                  <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                    {index + 1}
                  </span>

                  {/* Step content */}
                  <div className="min-w-0 flex-1 space-y-2">
                    {step.action && (
                      <div className="border-l-2 border-slate-400 pl-2 dark:border-slate-500">
                        <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                          Action
                        </p>
                        <div className="text-sm leading-relaxed text-slate-800 dark:text-slate-200">
                          <StepMarkdown>{step.action}</StepMarkdown>
                        </div>
                      </div>
                    )}
                    {step.data && (
                      <div className="border-l-2 border-amber-400 pl-2 dark:border-amber-500">
                        <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-500 dark:text-amber-400">
                          Data
                        </p>
                        <div className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                          <StepMarkdown>{step.data}</StepMarkdown>
                        </div>
                      </div>
                    )}
                    {step.result && (
                      <div className="border-l-2 border-indigo-400 pl-2 dark:border-indigo-500">
                        <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-500 dark:text-indigo-400">
                          Expected
                        </p>
                        <div className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                          <StepMarkdown>{step.result}</StepMarkdown>
                        </div>
                      </div>
                    )}

                    {/* Actual result — editable */}
                    <div className="border-l-2 border-emerald-400 pl-2 dark:border-emerald-500">
                      <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-500 dark:text-emerald-400">
                        Actual
                      </p>
                      {isEditingActual ? (
                        <div className="flex items-center gap-1">
                          <input
                            autoFocus
                            className="flex-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
                            placeholder="Actual result..."
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveAndClose(step);
                              if (e.key === "Escape") cancelEditing();
                              e.stopPropagation();
                            }}
                          />
                          <Button
                            size="sm"
                            className="h-6 px-2 text-xs"
                            disabled={isSaving}
                            onClick={() => saveAndClose(step)}
                          >
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs"
                            onClick={cancelEditing}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div
                          className="group cursor-pointer text-sm leading-relaxed text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
                          onClick={() => startEditing(step, "actualResult")}
                        >
                          {step.actual_result ? (
                            <StepMarkdown>{step.actual_result}</StepMarkdown>
                          ) : (
                            <span className="italic text-slate-300 dark:text-slate-600">
                              click to add
                            </span>
                          )}
                          <Pencil className="mt-0.5 hidden h-3 w-3 group-hover:inline-block" />
                        </div>
                      )}
                    </div>

                    {/* Comment — editable */}
                    <div className="border-l-2 border-slate-300 pl-2 dark:border-slate-600">
                      <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        Comment
                      </p>
                      {isEditingComment ? (
                        <div className="flex items-center gap-1">
                          <input
                            autoFocus
                            className="flex-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
                            placeholder="Step comment..."
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveAndClose(step);
                              if (e.key === "Escape") cancelEditing();
                              e.stopPropagation();
                            }}
                          />
                          <Button
                            size="sm"
                            className="h-6 px-2 text-xs"
                            disabled={isSaving}
                            onClick={() => saveAndClose(step)}
                          >
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs"
                            onClick={cancelEditing}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div
                          className="group cursor-pointer text-sm leading-relaxed text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                          onClick={() => startEditing(step, "comment")}
                        >
                          {step.comment ? (
                            <StepMarkdown>{step.comment}</StepMarkdown>
                          ) : (
                            <span className="italic text-slate-300 dark:text-slate-600">
                              add comment...
                            </span>
                          )}
                          <Pencil className="mt-0.5 hidden h-3 w-3 group-hover:inline-block" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Step status + buttons */}
                  <div className="flex flex-shrink-0 items-center gap-1.5">
                    {step.status && (
                      <Badge variant={statusVariant(step.status.name)} className="mr-1 text-[10px]">
                        {step.status.name}
                      </Badge>
                    )}
                    {stepStatuses.map((s) => {
                      const isActive = currentStatus === s.name.toUpperCase();
                      return (
                        <button
                          key={s.name}
                          title={s.description ?? s.name}
                          disabled={isPending}
                          onClick={() => onStepStatusChange(step, s.name)}
                          style={statusButtonStyle(s.color, isActive)}
                          className={cn(
                            "rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                            !s.color &&
                              (isActive
                                ? "border-transparent bg-slate-800 text-white"
                                : "border-transparent bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"),
                          )}
                        >
                          {s.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
