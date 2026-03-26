import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  useIterationStepResults,
  useUpdateIterationStatus,
  useUpdateExecutionFixVersion,
  useProjectVersions,
  useAddDefectsToTestRun,
  queryKeys,
} from "@/services/queries";
import * as api from "@/services/tauri";
import { parseRateLimitError } from "@/stores/uiStore";
import { MiniStackedBar } from "@/components/charts/StatusCharts";
import { buildSlicesFromCounts } from "@/components/charts/status-utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { statusVariant } from "@/components/ui/badge-utils";
import { cn } from "@/components/ui/utils";
import {
  ArrowLeft,
  ArrowUpDown,
  Bug,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Loader2,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  X,
} from "lucide-react";
import { Toast } from "@/components/ui/toast";
import { showToast } from "@/components/ui/toast-utils";
import type { ToastMessage } from "@/components/ui/toast-utils";
import type {
  CucumberResult,
  JiraVersion,
  TestExecution,
  TestRun,
  TestRunIteration,
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

/** Sentinel value meaning "runs whose test belongs to no test set". */
const FILTER_NONE = "__none__";

/**
 * Discriminated union for virtual rows — either a section header or a test run.
 */
type VirtualItem =
  | {
      type: "header";
      setIssueId: string;
      label: string;
      setKey: string;
      runs: TestRun[];
      counts: Record<string, number>;
    }
  | { type: "run"; run: TestRun; sectionId: string };

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

  // ── Fix version state ──────────────────────────────────────────────────────
  // Derive the Jira project key from the issue key (e.g. "PROJ-123" → "PROJ").
  const execProjectKey = execution.jira.key.split("-")[0] ?? null;
  const { data: projectVersions } = useProjectVersions(execProjectKey);
  const updateFixVersion = useUpdateExecutionFixVersion();
  const [versionPickerOpen, setVersionPickerOpen] = useState(false);
  const [versionSearch, setVersionSearch] = useState("");

  const filteredVersions = useMemo(() => {
    const q = versionSearch.toLowerCase();
    return (projectVersions ?? []).filter((v) => !q || v.name.toLowerCase().includes(q));
  }, [projectVersions, versionSearch]);

  const [activeComment, setActiveComment] = useState<string | null>(null);
  const [commentValue, setCommentValue] = useState("");
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());
  const [collapsedSets, setCollapsedSets] = useState<Set<string>>(new Set());
  const [testSearch, setTestSearch] = useState("");
  const [sortByStatus, setSortByStatus] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  /** Tracks whether the component is still mounted so the "Load all" pump can
   *  bail out instead of scheduling more fetches after unmount. */
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);
  /** Status name to filter by, or null to show all. */
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  /** Bulk selection mode state */
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedRunIds, setSelectedRunIds] = useState<Set<string>>(new Set());
  /** Defect picker state */
  const addDefects = useAddDefectsToTestRun();
  const [defectPickerOpen, setDefectPickerOpen] = useState<string | null>(null);
  const [defectInputValue, setDefectInputValue] = useState("");
  const defectPickerRef = useRef<HTMLDivElement>(null);
  const parentRef = useRef<HTMLDivElement>(null);
  const [listHeight, setListHeight] = useState(600);

  // ── Mutation feedback ────────────────────────────────────────────────────────
  /** Tracks in-flight mutation keys for per-button saving spinners. */
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const addSavingKey = useCallback((key: string) => {
    setSavingKeys((prev) => new Set(prev).add(key));
  }, []);

  const removeSavingKey = useCallback((key: string) => {
    setSavingKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  // Resize the virtualised list to fill available space dynamically.
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setListHeight(entry.contentRect.height);
    });
    ro.observe(el.parentElement ?? el);
    return () => ro.disconnect();
  }, []);

  // Dismiss defect picker when clicking outside it.
  useEffect(() => {
    if (!defectPickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (defectPickerRef.current && !defectPickerRef.current.contains(e.target as Node)) {
        setDefectPickerOpen(null);
        setDefectInputValue("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [defectPickerOpen]);

  // ── Add-tests panel state ──────────────────────────────────────────────────
  const [addPanelOpen, setAddPanelOpen] = useState(false);
  /** "sets" | "tests" tab inside the add panel */
  const [addTab, setAddTab] = useState<"sets" | "tests">("sets");
  const [addSetSearch, setAddSetSearch] = useState("");
  const [addTestSearch, setAddTestSearch] = useState("");
  const [selectedTestIds, setSelectedTestIds] = useState<Set<string>>(new Set());
  /** issueId of the test set currently being expanded into selectedTestIds */
  const [loadingSetId, setLoadingSetId] = useState<string | null>(null);

  // Only fetch tests when the panel is open to avoid unnecessary calls.
  const { data: allTests, isLoading: testsLoading } = useGetTests(
    addPanelOpen ? (contentProjectKey ?? undefined) : undefined,
  );
  // Always pass projectKey so results land in the shared cache slot every other page reads from.
  // The enabled: !!projectKey guard inside the hook prevents network calls when key is absent.
  const { data: allTestSets, isLoading: testSetsLoading } = useGetTestSets(
    contentProjectKey ?? undefined,
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

  // Apply text search, optional status filter, then optional status sort.
  const filteredRuns = useMemo(() => {
    let result = runs;

    // 1. Key / name search
    const q = testSearch.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (r) =>
          r.test.jira.key.toLowerCase().includes(q) ||
          r.test.jira.summary.toLowerCase().includes(q),
      );
    }

    // 2. Status filter
    if (statusFilter) {
      result = result.filter((r) => r.status.name.toUpperCase() === statusFilter.toUpperCase());
    }

    // 3. Status sort (stable — preserves original order within the same status group)
    if (sortByStatus) {
      result = [...result].sort((a, b) => {
        const oa = STATUS_SORT_ORDER[a.status.name.toUpperCase()] ?? 99;
        const ob = STATUS_SORT_ORDER[b.status.name.toUpperCase()] ?? 99;
        return oa - ob;
      });
    }

    return result;
  }, [runs, testSearch, sortByStatus, statusFilter]);

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

  const toggleCollapsed = (setIssueId: string) => {
    setCollapsedSets((prev) => {
      const next = new Set(prev);
      if (next.has(setIssueId)) {
        next.delete(setIssueId);
      } else {
        next.add(setIssueId);
      }
      return next;
    });
  };

  // Build the virtualised row list: group filteredRuns by test set, inserting
  // collapsible section headers. If no test sets are loaded, show runs flat.
  const virtualRows = useMemo((): VirtualItem[] => {
    // If no test-set data, just show a flat list.
    if (testSets.length === 0) {
      return filteredRuns.map((run) => ({ type: "run" as const, run, sectionId: "" }));
    }

    // Build ordered sections map (preserving testSets order).
    const sections = new Map<string, { label: string; setKey: string; runs: TestRun[] }>();
    for (const ts of testSets) {
      if (!sections.has(ts.issue_id)) {
        sections.set(ts.issue_id, {
          label: ts.jira.summary,
          setKey: ts.jira.key,
          runs: [],
        });
      }
    }

    const ungroupedRuns: TestRun[] = [];

    for (const run of filteredRuns) {
      const sets = membership.get(run.test.issue_id) ?? [];
      if (sets.length === 0) {
        ungroupedRuns.push(run);
      } else {
        // Place run in first matching section; fall back to ungrouped.
        let placed = false;
        for (const s of sets) {
          if (sections.has(s.issueId)) {
            sections.get(s.issueId)!.runs.push(run);
            placed = true;
            break;
          }
        }
        if (!placed) ungroupedRuns.push(run);
      }
    }

    const rows: VirtualItem[] = [];

    for (const [setIssueId, section] of sections) {
      if (section.runs.length === 0) continue;
      const counts: Record<string, number> = {};
      for (const run of section.runs) {
        const k = run.status.name.toUpperCase();
        counts[k] = (counts[k] ?? 0) + 1;
      }
      rows.push({
        type: "header",
        setIssueId,
        label: section.label,
        setKey: section.setKey,
        runs: section.runs,
        counts,
      });
      if (!collapsedSets.has(setIssueId)) {
        for (const run of section.runs) {
          rows.push({ type: "run", run, sectionId: setIssueId });
        }
      }
    }

    if (ungroupedRuns.length > 0) {
      const counts: Record<string, number> = {};
      for (const run of ungroupedRuns) {
        const k = run.status.name.toUpperCase();
        counts[k] = (counts[k] ?? 0) + 1;
      }
      rows.push({
        type: "header",
        setIssueId: FILTER_NONE,
        label: "No Test Set",
        setKey: "—",
        runs: ungroupedRuns,
        counts,
      });
      if (!collapsedSets.has(FILTER_NONE)) {
        for (const run of ungroupedRuns) {
          rows.push({ type: "run", run, sectionId: FILTER_NONE });
        }
      }
    }

    return rows;
  }, [filteredRuns, testSets, membership, collapsedSets]);

  const virtualizer = useVirtualizer({
    count: virtualRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => {
      const item = virtualRows[i];
      return item?.type === "header" ? 52 : 56;
    },
    overscan: 10,
    getItemKey: (i) => {
      const item = virtualRows[i];
      if (!item) return i;
      return item.type === "header" ? `h:${item.setIssueId}` : item.run.id;
    },
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

  // Pagination is entirely user-driven (Load more / Load all buttons in the footer).
  // Auto-fetching on scroll is intentionally disabled to avoid hammering the Xray API,
  // especially when a status filter is active and each new page triggers an extra call.
  const virtualItems = virtualizer.getVirtualItems();

  const handleStatusChange = useCallback(
    (run: TestRun, newStatus: string) => {
      const key = `run:${run.id}`;
      addSavingKey(key);
      updateStatus.mutate(
        {
          testRunId: run.id,
          status: newStatus,
          executionIssueId: execution.issue_id,
        },
        {
          onSettled: () => removeSavingKey(key),
          onError: (err) =>
            showToast(
              setToast,
              `Failed to update status for ${run.test?.jira?.key ?? run.id}: ${String(err)}`,
              "error",
            ),
        },
      );
    },
    [updateStatus, execution.issue_id, addSavingKey, removeSavingKey],
  );

  const handleStepStatusChange = useCallback(
    (run: TestRun, step: TestRunStep, newStatus: string) => {
      const key = `step:${run.id}:${step.id}`;
      addSavingKey(key);
      updateStepStatus.mutate(
        {
          testRunId: run.id,
          stepId: step.id,
          status: newStatus,
          executionIssueId: execution.issue_id,
        },
        {
          onSettled: () => removeSavingKey(key),
          onError: (err) =>
            showToast(setToast, `Failed to update step status: ${String(err)}`, "error"),
        },
      );
    },
    [updateStepStatus, execution.issue_id, addSavingKey, removeSavingKey],
  );

  const handleSaveComment = useCallback(
    (run: TestRun) => {
      const key = `comment:${run.id}`;
      addSavingKey(key);
      updateComment.mutate(
        {
          testRunId: run.id,
          comment: commentValue,
          executionIssueId: execution.issue_id,
        },
        {
          onSettled: () => removeSavingKey(key),
          onError: (err) => showToast(setToast, `Failed to save comment: ${String(err)}`, "error"),
        },
      );
      setActiveComment(null);
      setCommentValue("");
    },
    [updateComment, commentValue, execution.issue_id, addSavingKey, removeSavingKey],
  );

  const handleSaveStepField = useCallback(
    (run: TestRun, step: TestRunStep, field: "comment" | "actualResult", value: string) => {
      const key = `stepField:${run.id}:${step.id}:${field}`;
      addSavingKey(key);
      updateStep.mutate(
        {
          testRunId: run.id,
          stepId: step.id,
          [field]: value,
          executionIssueId: execution.issue_id,
        },
        {
          onSettled: () => removeSavingKey(key),
          onError: (err) =>
            showToast(setToast, `Failed to save step ${field}: ${String(err)}`, "error"),
        },
      );
    },
    [updateStep, execution.issue_id, addSavingKey, removeSavingKey],
  );

  // ── Bulk operations ─────────────────────────────────────────────────────────

  const handleBulkStepStatus = useCallback(
    async (run: TestRun, newStatus: string) => {
      if (!run.steps) return;
      const stepsToUpdate = run.steps.filter(
        (step) => step.status?.name?.toUpperCase() !== newStatus.toUpperCase(),
      );
      for (const step of stepsToUpdate) {
        const key = `step:${run.id}:${step.id}`;
        addSavingKey(key);
        try {
          await updateStepStatus.mutateAsync({
            testRunId: run.id,
            stepId: step.id,
            status: newStatus,
            executionIssueId: execution.issue_id,
          });
        } catch (err) {
          showToast(setToast, `Failed to update step status: ${String(err)}`, "error");
        } finally {
          removeSavingKey(key);
        }
      }
    },
    [updateStepStatus, execution.issue_id, addSavingKey, removeSavingKey],
  );

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
  const summarySlices = useMemo(() => {
    const rawCounts = filteredRuns.reduce<Record<string, number>>((acc, run) => {
      const name = run.status.name.toUpperCase();
      acc[name] = (acc[name] ?? 0) + 1;
      return acc;
    }, {});
    // buildSlicesFromCounts merges aliases (PASSED→PASS, NOT RUN→TODO, etc.) and
    // keeps N/A and any other custom status as its own distinct slice.
    return buildSlicesFromCounts(rawCounts, total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredRuns]); // `total` is derived from filteredRuns.length — redundant dep

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
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="font-mono text-xs text-slate-400">{execution.jira.key}</p>
            {/* Fix Version display + picker */}
            <div className="relative">
              <button
                onClick={() => {
                  setVersionPickerOpen((v) => !v);
                  setVersionSearch("");
                }}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                title="Set fix version"
              >
                <span className="text-slate-400">fixVersion:</span>
                <span className="font-medium text-slate-600 dark:text-slate-300">
                  {execution.jira.fix_versions?.[0]?.name ?? "—"}
                </span>
                <Pencil className="h-3 w-3 opacity-50" />
              </button>
              {versionPickerOpen && (
                <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
                  <div className="p-1.5">
                    <input
                      autoFocus
                      placeholder="Search versions…"
                      value={versionSearch}
                      onChange={(e) => setVersionSearch(e.target.value)}
                      className="w-full rounded border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {/* Clear option */}
                    <button
                      className="flex w-full items-center px-3 py-1.5 text-left text-xs text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
                      onClick={() => {
                        setVersionPickerOpen(false);
                        updateFixVersion.mutate({
                          issueKey: execution.jira.key,
                          versionId: "",
                          executionProjectKey: execProjectKey ?? "",
                        });
                      }}
                    >
                      — clear —
                    </button>
                    {filteredVersions.map((v: JiraVersion) => (
                      <button
                        key={v.id}
                        className="flex w-full items-center px-3 py-1.5 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-700"
                        onClick={() => {
                          setVersionPickerOpen(false);
                          updateFixVersion.mutate({
                            issueKey: execution.jira.key,
                            versionId: v.id,
                            executionProjectKey: execProjectKey ?? "",
                          });
                        }}
                      >
                        {v.name}
                      </button>
                    ))}
                    {projectVersions?.length === 0 && (
                      <p className="px-3 py-2 text-xs text-slate-400">No versions found</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading test runs from Xray…</span>
          </div>
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
              <button
                onClick={() => {
                  setIsSelectMode((prev) => !prev);
                  setSelectedRunIds(new Set());
                }}
                title={isSelectMode ? "Exit select mode" : "Select runs to bulk-update status"}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium shadow-sm transition-colors",
                  isSelectMode
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:bg-slate-700",
                )}
              >
                <CheckCheck className="h-3.5 w-3.5" />
                {isSelectMode ? "Cancel" : "Select"}
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
            <div className="grid grid-cols-[auto_2fr_1fr_auto_auto_auto] gap-4 border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-700/60 dark:text-slate-400">
              <span className="w-5"></span>
              <span>Test</span>
              <span>Status</span>
              <span>Update status</span>
              <span></span>
              <span></span>
            </div>

            {/* Virtualised rows */}
            <div ref={parentRef} className="overflow-auto" style={{ height: listHeight }}>
              <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
                {virtualItems.map((virtualRow) => {
                  const item = virtualRows[virtualRow.index];
                  if (!item) return null;

                  // ── Section header ──────────────────────────────────────────
                  if (item.type === "header") {
                    const isCollapsed = collapsedSets.has(item.setIssueId);
                    return (
                      <div
                        key={`h:${item.setIssueId}`}
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
                        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-700/60">
                          {isSelectMode && (
                            <input
                              type="checkbox"
                              title="Select all in section"
                              className="h-4 w-4 shrink-0 accent-blue-600"
                              checked={
                                item.runs.length > 0 &&
                                item.runs.every((r) => selectedRunIds.has(r.id))
                              }
                              onChange={(e) => {
                                e.stopPropagation();
                                setSelectedRunIds((prev) => {
                                  const next = new Set(prev);
                                  if (e.target.checked) {
                                    for (const r of item.runs) next.add(r.id);
                                  } else {
                                    for (const r of item.runs) next.delete(r.id);
                                  }
                                  return next;
                                });
                              }}
                            />
                          )}
                          <button
                            onClick={() => toggleCollapsed(item.setIssueId)}
                            className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-600"
                            aria-label={isCollapsed ? "Expand section" : "Collapse section"}
                          >
                            {isCollapsed ? (
                              <ChevronRight className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </button>
                          <span className="font-mono text-xs text-slate-400">{item.setKey}</span>
                          <span className="flex-1 truncate text-sm font-medium text-slate-700 dark:text-slate-300">
                            {item.label}
                          </span>
                          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-600 dark:text-slate-300">
                            {item.runs.length}
                          </span>
                          <MiniStackedBar
                            slices={buildSlicesFromCounts(item.counts, item.runs.length)}
                            className="w-24"
                          />
                        </div>
                      </div>
                    );
                  }

                  // ── Test run row ────────────────────────────────────────────
                  const { run } = item;
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
                      <div
                        className={cn(
                          "grid items-center gap-4 border-b border-slate-50 px-4 py-3 last:border-0 hover:bg-slate-50/50 dark:border-slate-700 dark:hover:bg-slate-700/40",
                          isSelectMode
                            ? "grid-cols-[auto_2fr_1fr_auto_auto_auto]"
                            : "grid-cols-[2fr_1fr_auto_auto_auto]",
                        )}
                      >
                        {/* Select checkbox (only in select mode) */}
                        {isSelectMode && (
                          <input
                            type="checkbox"
                            className="h-4 w-4 shrink-0 accent-blue-600"
                            checked={selectedRunIds.has(run.id)}
                            onChange={(e) => {
                              e.stopPropagation();
                              setSelectedRunIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(run.id)) {
                                  next.delete(run.id);
                                } else {
                                  next.add(run.id);
                                }
                                return next;
                              });
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        )}
                        {/* Expand toggle + test identity (unified click target) */}
                        <button
                          onClick={() => hasSteps && toggleExpanded(run.id)}
                          className={cn(
                            "flex min-w-0 items-center gap-2 text-left",
                            hasSteps ? "cursor-pointer" : "cursor-default",
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
                          <span
                            className={cn(
                              "flex h-5 w-5 shrink-0 items-center justify-center rounded",
                              hasSteps ? "text-slate-400" : "text-transparent",
                            )}
                          >
                            {hasSteps &&
                              (isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              ))}
                          </span>
                          <span className="min-w-0">
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
                          </span>
                        </button>

                        {/* Current status */}
                        <Badge variant={statusVariant(run.status.name)}>
                          {savingKeys.has(`run:${run.id}`) && (
                            <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                          )}
                          {run.status.name}
                        </Badge>

                        {/* Status quick-actions (dynamic) */}
                        <div className="flex flex-wrap items-center gap-1">
                          {statuses.map((s) => {
                            const isActive = run.status.name.toUpperCase() === s.name.toUpperCase();
                            return (
                              <button
                                key={s.name}
                                title={s.description ?? s.name}
                                disabled={savingKeys.has(`run:${run.id}`)}
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

                        {/* Defect chips + bug link button */}
                        <div className="flex items-center gap-1">
                          {(run.defects ?? []).map((key) => (
                            <span
                              key={key}
                              className="rounded border border-red-200 bg-red-50 px-1.5 py-0.5 font-mono text-[10px] font-medium text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400"
                            >
                              {key}
                            </span>
                          ))}
                          <div className="relative">
                            <button
                              title="Link defect"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDefectPickerOpen((prev) => (prev === run.id ? null : run.id));
                                setDefectInputValue("");
                              }}
                              className={cn(
                                "rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700",
                                (run.defects?.length ?? 0) > 0
                                  ? "text-red-400 hover:text-red-600"
                                  : "text-slate-400 hover:text-slate-700",
                              )}
                            >
                              <Bug className="h-4 w-4" />
                            </button>
                            {defectPickerOpen === run.id && (
                              <div
                                ref={defectPickerRef}
                                className="absolute right-0 top-full z-20 mt-1 w-60 rounded-md border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-800"
                              >
                                <p className="mb-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                                  Link defect(s)
                                </p>
                                <input
                                  autoFocus
                                  value={defectInputValue}
                                  onChange={(e) => setDefectInputValue(e.target.value)}
                                  placeholder="BUG-123, BUG-456"
                                  className="w-full rounded border border-slate-200 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
                                  onKeyDown={(e) => {
                                    e.stopPropagation();
                                    if (e.key === "Enter") {
                                      const keys = defectInputValue
                                        .split(",")
                                        .map((k) => k.trim())
                                        .filter(Boolean);
                                      if (keys.length) {
                                        addDefects.mutate({
                                          testRunId: run.id,
                                          issueKeys: keys,
                                          executionIssueId: execution.issue_id,
                                        });
                                      }
                                      setDefectPickerOpen(null);
                                      setDefectInputValue("");
                                    }
                                    if (e.key === "Escape") {
                                      setDefectPickerOpen(null);
                                      setDefectInputValue("");
                                    }
                                  }}
                                />
                                <div className="mt-2 flex justify-end gap-1.5">
                                  <button
                                    onClick={() => {
                                      setDefectPickerOpen(null);
                                      setDefectInputValue("");
                                    }}
                                    className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    disabled={!defectInputValue.trim()}
                                    onClick={() => {
                                      const keys = defectInputValue
                                        .split(",")
                                        .map((k) => k.trim())
                                        .filter(Boolean);
                                      if (keys.length) {
                                        addDefects.mutate({
                                          testRunId: run.id,
                                          issueKeys: keys,
                                          executionIssueId: execution.issue_id,
                                        });
                                      }
                                      setDefectPickerOpen(null);
                                      setDefectInputValue("");
                                    }}
                                    className="rounded bg-slate-800 px-2 py-1 text-xs text-white disabled:opacity-40 hover:bg-slate-700 dark:bg-slate-600 dark:hover:bg-slate-500"
                                  >
                                    Link
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
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
                      {isExpanded && (
                        <RunExpandedPanel
                          run={run}
                          stepStatuses={stepStatuses}
                          onStepStatusChange={handleStepStatusChange}
                          onSaveStepField={handleSaveStepField}
                          onBulkStepStatus={handleBulkStepStatus}
                          isPending={updateStepStatus.isPending}
                          isSaving={updateStep.isPending}
                          savingKeys={savingKeys}
                          executionIssueId={execution.issue_id}
                          addSavingKey={addSavingKey}
                          removeSavingKey={removeSavingKey}
                          setToast={setToast}
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
                        if (!mountedRef.current) return;
                        void fetchNextPage().then(({ hasNextPage: more }) => {
                          if (!mountedRef.current) return;
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

          {/* ── Bulk action floating bar ── */}
          {isSelectMode && selectedRunIds.size > 0 && (
            <div className="fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 shadow-lg dark:border-slate-700 dark:bg-slate-800">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                {selectedRunIds.size} selected
              </span>
              <button
                onClick={() => setSelectedRunIds(new Set())}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
                title="Clear selection"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <div className="mx-1 h-4 w-px bg-slate-200 dark:bg-slate-700" />
              {statuses.map((s) => (
                <button
                  key={s.name}
                  title={`Set all selected to ${s.name}`}
                  style={statusButtonStyle(s.color, false)}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                    !s.color &&
                      "border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600",
                  )}
                  onClick={() => {
                    const ids = [...selectedRunIds];
                    setSelectedRunIds(new Set());
                    setIsSelectMode(false);
                    // Update sequentially to avoid hammering the API.
                    void (async () => {
                      for (const id of ids) {
                        const key = `run:${id}`;
                        addSavingKey(key);
                        try {
                          await updateStatus.mutateAsync({
                            testRunId: id,
                            status: s.name,
                            executionIssueId: execution.issue_id,
                          });
                        } catch (err) {
                          showToast(setToast, `Failed to update status: ${String(err)}`, "error");
                        } finally {
                          removeSavingKey(key);
                        }
                      }
                    })();
                  }}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      <Toast message={toast} />
    </div>
  );
}

// ── RunExpandedPanel ──────────────────────────────────────────────────────────
// Memoized wrapper that owns stable per-run callbacks for the steps/iterations
// panels so they aren't recreated on every virtualizer scroll tick (#36).

interface RunExpandedPanelProps {
  run: TestRun;
  stepStatuses: XrayStepStatus[];
  onStepStatusChange: (run: TestRun, step: TestRunStep, status: string) => void;
  onSaveStepField: (
    run: TestRun,
    step: TestRunStep,
    field: "comment" | "actualResult",
    value: string,
  ) => void;
  onBulkStepStatus: (run: TestRun, status: string) => void;
  isPending: boolean;
  isSaving: boolean;
  savingKeys: Set<string>;
  executionIssueId: string;
  addSavingKey: (key: string) => void;
  removeSavingKey: (key: string) => void;
  setToast: React.Dispatch<React.SetStateAction<ToastMessage | null>>;
}

const RunExpandedPanel = memo(function RunExpandedPanel({
  run,
  stepStatuses,
  onStepStatusChange,
  onSaveStepField,
  onBulkStepStatus,
  isPending,
  isSaving,
  savingKeys,
  executionIssueId,
  addSavingKey,
  removeSavingKey,
  setToast,
}: RunExpandedPanelProps) {
  const isCucumber = run.test_type?.name?.toLowerCase() === "cucumber" || !!run.gherkin;
  const hasManualSteps = (run.steps?.length ?? 0) > 0;

  const handleStepStatusChange = useCallback(
    (step: TestRunStep, status: string) => onStepStatusChange(run, step, status),
    [run, onStepStatusChange],
  );
  const handleSaveStepField = useCallback(
    (step: TestRunStep, field: "comment" | "actualResult", value: string) =>
      onSaveStepField(run, step, field, value),
    [run, onSaveStepField],
  );
  const handleBulkStepStatus = useCallback(
    (status: string) => onBulkStepStatus(run, status),
    [run, onBulkStepStatus],
  );

  return (
    <>
      {isCucumber && <GherkinPanel gherkin={run.gherkin} results={run.results} />}
      {hasManualSteps && (
        <StepsPanel
          run={run}
          steps={run.steps!}
          stepStatuses={stepStatuses}
          onStepStatusChange={handleStepStatusChange}
          onSaveStepField={handleSaveStepField}
          onBulkStepStatus={handleBulkStepStatus}
          isPending={isPending}
          isSaving={isSaving}
          savingKeys={savingKeys}
        />
      )}
      {hasManualSteps && (run.iterations?.results.length ?? 0) > 0 && (
        <IterationsPanel
          testRunId={run.id}
          iterations={run.iterations!.results}
          steps={run.steps!}
          stepStatuses={stepStatuses}
          executionIssueId={executionIssueId}
          savingKeys={savingKeys}
          addSavingKey={addSavingKey}
          removeSavingKey={removeSavingKey}
          setToast={setToast}
        />
      )}
    </>
  );
});

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
              key={`${index}:${step.keyword}:${step.sentence.slice(0, 40)}`}
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
  /** In-flight mutation keys for per-button saving spinners. */
  savingKeys: Set<string>;
}

interface IterationsPanelProps {
  testRunId: string;
  iterations: TestRunIteration[];
  steps: TestRunStep[];
  stepStatuses: XrayTestRunStatus[];
  executionIssueId: string;
  /** In-flight mutation keys for per-button saving spinners. */
  savingKeys: Set<string>;
  addSavingKey: (key: string) => void;
  removeSavingKey: (key: string) => void;
  setToast: React.Dispatch<React.SetStateAction<ToastMessage | null>>;
}

function StepsPanel({
  steps,
  run,
  stepStatuses,
  onStepStatusChange,
  onSaveStepField,
  onBulkStepStatus,
  isPending,
  isSaving,
  savingKeys,
}: StepsPanelProps) {
  const [editingStep, setEditingStep] = useState<{
    stepId: string;
    field: "comment" | "actualResult";
  } | null>(null);
  const [editValue, setEditValue] = useState("");
  const stepRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const setStepRef = useCallback((el: HTMLDivElement | null, stepId: string) => {
    if (el) {
      stepRefs.current.set(stepId, el);
    } else {
      stepRefs.current.delete(stepId);
    }
  }, []);

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
  const handleStepKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
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
    },
    [steps],
  );

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
                ref={(el) => setStepRef(el, step.id)}
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
                        {savingKeys.has(`step:${run.id}:${step.id}`) ? (
                          <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                        ) : null}
                        {step.status.name}
                      </Badge>
                    )}
                    {stepStatuses.map((s) => {
                      const isActive = currentStatus === s.name.toUpperCase();
                      return (
                        <button
                          key={s.name}
                          title={s.description ?? s.name}
                          disabled={savingKeys.has(`step:${run.id}:${step.id}`)}
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

function IterationsPanel({
  testRunId,
  iterations,
  steps,
  stepStatuses,
  executionIssueId,
  savingKeys,
  addSavingKey,
  removeSavingKey,
  setToast,
}: IterationsPanelProps) {
  const [expandedIterations, setExpandedIterations] = useState<Set<string>>(new Set());
  // Fetch step results lazily — only fires once the panel mounts (i.e. user expanded a run).
  const { data: stepResultsData, isLoading: isLoadingStepResults } =
    useIterationStepResults(testRunId);
  const updateIterationStatus = useUpdateIterationStatus();

  // Editable iteration step fields
  const queryClient = useQueryClient();
  const updateStep = useUpdateTestRunStep();
  const [editingIterStep, setEditingIterStep] = useState<{
    stepId: string;
    iterRank: string;
    field: "actualResult" | "comment";
  } | null>(null);
  const [editIterValue, setEditIterValue] = useState("");

  const startIterStepEdit = (
    stepId: string,
    iterRank: string,
    field: "actualResult" | "comment",
    currentValue: string,
  ) => {
    setEditingIterStep({ stepId, iterRank, field });
    setEditIterValue(currentValue);
  };

  const saveIterStep = () => {
    if (!editingIterStep) return;
    const stepKey = `iterStep:${testRunId}:${editingIterStep.stepId}:${editingIterStep.iterRank}`;
    addSavingKey(stepKey);
    updateStep.mutate(
      {
        testRunId,
        stepId: editingIterStep.stepId,
        ...(editingIterStep.field === "actualResult"
          ? { actualResult: editIterValue }
          : { comment: editIterValue }),
        executionIssueId,
      },
      {
        onSuccess: () =>
          void queryClient.invalidateQueries({
            queryKey: queryKeys.iterationStepResults(testRunId),
          }),
        onError: (err) => showToast(setToast, `Failed to save step field: ${String(err)}`, "error"),
        onSettled: () => removeSavingKey(stepKey),
      },
    );
    setEditingIterStep(null);
    setEditIterValue("");
  };

  const cancelIterStepEdit = () => {
    setEditingIterStep(null);
    setEditIterValue("");
  };

  const toggleIteration = (rank: string) => {
    setExpandedIterations((prev) => {
      const next = new Set(prev);
      if (next.has(rank)) {
        next.delete(rank);
      } else {
        next.add(rank);
      }
      return next;
    });
  };

  return (
    <div className="border-b border-teal-100 bg-teal-50/40 dark:border-teal-900/40 dark:bg-teal-900/10">
      <div className="px-6 py-2">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-teal-500 dark:text-teal-400">
          Iterations ({iterations.length})
        </p>
        <div className="space-y-1">
          {iterations.map((iteration) => {
            const rank = iteration.rank ?? "?";
            const isOpen = expandedIterations.has(rank);
            // Match the step results for this iteration from the lazy-loaded data
            const iterationStepResults = stepResultsData?.find((r) => r.rank === rank);

            return (
              <div
                key={rank}
                className="rounded-md border border-teal-200 bg-white dark:border-teal-800 dark:bg-slate-800"
              >
                {/* Iteration header row */}
                <div className="flex w-full items-center gap-2 px-3 py-2">
                  <button
                    className="flex flex-1 items-center gap-2 text-left"
                    onClick={() => toggleIteration(rank)}
                  >
                    {isOpen ? (
                      <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-teal-400" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-teal-400" />
                    )}
                    <span className="text-xs font-semibold text-teal-700 dark:text-teal-300">
                      Iteration {rank}
                    </span>
                    {/* Parameter chips */}
                    <div className="flex flex-1 flex-wrap gap-1">
                      {iteration.parameters.map((p, i) => (
                        <span
                          key={`${p.name ?? ""}:${p.value ?? ""}:${i}`}
                          className="rounded border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-[10px] text-teal-700 dark:border-teal-700 dark:bg-teal-900/30 dark:text-teal-300"
                        >
                          {p.name && p.value ? `${p.name}=${p.value}` : (p.value ?? p.name ?? "")}
                        </span>
                      ))}
                    </div>
                  </button>
                  {/* Iteration status buttons */}
                  <div className="ml-auto flex flex-shrink-0 items-center gap-1">
                    {savingKeys.has(`iter:${testRunId}:${rank}`) && (
                      <Loader2 className="h-3 w-3 animate-spin text-teal-400" />
                    )}
                    {stepStatuses.map((s) => {
                      const isActive =
                        iteration.status?.name?.toUpperCase() === s.name.toUpperCase();
                      const iterKey = `iter:${testRunId}:${rank}`;
                      return (
                        <button
                          key={s.name}
                          title={`Set iteration ${rank} to ${s.name}`}
                          disabled={savingKeys.has(iterKey)}
                          onClick={() => {
                            addSavingKey(iterKey);
                            updateIterationStatus.mutate(
                              {
                                testRunId,
                                iterationRank: rank,
                                status: s.name,
                                executionIssueId,
                              },
                              {
                                onError: (err) =>
                                  showToast(
                                    setToast,
                                    `Failed to update iteration ${rank}: ${String(err)}`,
                                    "error",
                                  ),
                                onSettled: () => removeSavingKey(iterKey),
                              },
                            );
                          }}
                          style={statusButtonStyle(s.color, isActive)}
                          className={cn(
                            "rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                            isActive
                              ? "ring-1 ring-offset-1"
                              : !s.color &&
                                  "border-transparent bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600",
                          )}
                        >
                          {s.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Expanded: step results */}
                {isOpen && (
                  <div className="border-t border-teal-100 px-3 pb-2 pt-1 dark:border-teal-800">
                    {isLoadingStepResults ? (
                      <p className="py-2 text-xs text-slate-400">Loading step results…</p>
                    ) : (
                      <div className="space-y-1">
                        {steps.map((step, index) => {
                          const stepResult = iterationStepResults?.step_results?.results.find(
                            (sr) => sr.id === step.id,
                          );
                          const stepStatusName = stepResult?.status?.name;

                          return (
                            <div
                              key={step.id}
                              className="rounded border border-slate-100 bg-slate-50/60 px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-700/40"
                            >
                              <div className="flex items-start gap-2.5">
                                {/* Step number */}
                                <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-slate-200 text-[9px] font-medium text-slate-500 dark:bg-slate-600 dark:text-slate-400">
                                  {index + 1}
                                </span>

                                <div className="min-w-0 flex-1 space-y-1">
                                  {/* Action (read-only) */}
                                  {step.action && (
                                    <div className="border-l-2 border-slate-400 pl-2 dark:border-slate-500">
                                      <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                        Action
                                      </p>
                                      <div className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                                        <StepMarkdown>{step.action}</StepMarkdown>
                                      </div>
                                    </div>
                                  )}
                                  {/* Actual result (per-iteration, editable) */}
                                  {editingIterStep?.stepId === step.id &&
                                  editingIterStep.iterRank === rank &&
                                  editingIterStep.field === "actualResult" ? (
                                    <div className="border-l-2 border-emerald-400 pl-2 dark:border-emerald-500">
                                      <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-500 dark:text-emerald-400">
                                        Actual
                                      </p>
                                      <textarea
                                        autoFocus
                                        rows={3}
                                        value={editIterValue}
                                        onChange={(e) => setEditIterValue(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter" && !e.shiftKey) {
                                            e.preventDefault();
                                            saveIterStep();
                                          } else if (e.key === "Escape") {
                                            cancelIterStepEdit();
                                          }
                                        }}
                                        className="w-full rounded border border-emerald-300 bg-white px-2 py-1 text-xs text-slate-800 outline-none focus:ring-1 focus:ring-emerald-400 dark:border-emerald-600 dark:bg-slate-700 dark:text-slate-100"
                                      />
                                      <div className="mt-1 flex gap-1">
                                        <button
                                          onClick={saveIterStep}
                                          disabled={updateStep.isPending}
                                          className="rounded bg-emerald-500 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
                                        >
                                          Save
                                        </button>
                                        <button
                                          onClick={cancelIterStepEdit}
                                          className="rounded bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-300 dark:bg-slate-600 dark:text-slate-300 dark:hover:bg-slate-500"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div
                                      role="button"
                                      tabIndex={0}
                                      title="Click to edit actual result"
                                      onClick={() =>
                                        startIterStepEdit(
                                          step.id,
                                          rank,
                                          "actualResult",
                                          stepResult?.actual_result ?? "",
                                        )
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                          e.preventDefault();
                                          startIterStepEdit(
                                            step.id,
                                            rank,
                                            "actualResult",
                                            stepResult?.actual_result ?? "",
                                          );
                                        }
                                      }}
                                      className="group cursor-pointer border-l-2 border-emerald-400 pl-2 dark:border-emerald-500"
                                    >
                                      <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-500 dark:text-emerald-400">
                                        Actual
                                        <span className="ml-1 opacity-0 transition-opacity group-hover:opacity-60">
                                          <Pencil className="inline h-2.5 w-2.5" />
                                        </span>
                                      </p>
                                      {stepResult?.actual_result ? (
                                        <div className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                                          <StepMarkdown>{stepResult.actual_result}</StepMarkdown>
                                        </div>
                                      ) : (
                                        <p className="text-[10px] italic text-slate-400 group-hover:text-emerald-400 dark:text-slate-500 dark:group-hover:text-emerald-500">
                                          Add actual result…
                                        </p>
                                      )}
                                    </div>
                                  )}
                                  {/* Comment (per-iteration, editable) */}
                                  {editingIterStep?.stepId === step.id &&
                                  editingIterStep.iterRank === rank &&
                                  editingIterStep.field === "comment" ? (
                                    <div className="border-l-2 border-slate-300 pl-2 dark:border-slate-600">
                                      <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                        Comment
                                      </p>
                                      <textarea
                                        autoFocus
                                        rows={3}
                                        value={editIterValue}
                                        onChange={(e) => setEditIterValue(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter" && !e.shiftKey) {
                                            e.preventDefault();
                                            saveIterStep();
                                          } else if (e.key === "Escape") {
                                            cancelIterStepEdit();
                                          }
                                        }}
                                        className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 outline-none focus:ring-1 focus:ring-slate-400 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                                      />
                                      <div className="mt-1 flex gap-1">
                                        <button
                                          onClick={saveIterStep}
                                          disabled={updateStep.isPending}
                                          className="rounded bg-emerald-500 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
                                        >
                                          Save
                                        </button>
                                        <button
                                          onClick={cancelIterStepEdit}
                                          className="rounded bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-300 dark:bg-slate-600 dark:text-slate-300 dark:hover:bg-slate-500"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div
                                      role="button"
                                      tabIndex={0}
                                      title="Click to edit comment"
                                      onClick={() =>
                                        startIterStepEdit(
                                          step.id,
                                          rank,
                                          "comment",
                                          stepResult?.comment ?? "",
                                        )
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                          e.preventDefault();
                                          startIterStepEdit(
                                            step.id,
                                            rank,
                                            "comment",
                                            stepResult?.comment ?? "",
                                          );
                                        }
                                      }}
                                      className="group cursor-pointer border-l-2 border-slate-300 pl-2 dark:border-slate-600"
                                    >
                                      <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                        Comment
                                        <span className="ml-1 opacity-0 transition-opacity group-hover:opacity-60">
                                          <Pencil className="inline h-2.5 w-2.5" />
                                        </span>
                                      </p>
                                      {stepResult?.comment ? (
                                        <div className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                                          <StepMarkdown>{stepResult.comment}</StepMarkdown>
                                        </div>
                                      ) : (
                                        <p className="text-[10px] italic text-slate-400 group-hover:text-slate-500 dark:text-slate-500 dark:group-hover:text-slate-400">
                                          Add comment…
                                        </p>
                                      )}
                                    </div>
                                  )}
                                </div>

                                {/* Step result status */}
                                {stepStatusName && (
                                  <Badge
                                    variant={statusVariant(stepStatusName)}
                                    className="ml-auto flex-shrink-0 text-[10px]"
                                  >
                                    {stepStatusName}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
