import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StepMarkdown } from "./StepMarkdown";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import {
  useTestRuns,
  useTestRunDetail,
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
  useExecutionSummariesBatch,
  useConfig,
  useIssueTransitions,
  useTransitionIssue,
  useUpdateAssignee,
  useSearchUsers,
  queryKeys,
  TEST_RUNS_PAGE_SIZE,
} from "@/services/queries";
import { useCommentTemplatesStore } from "@/stores/commentTemplatesStore";
import { useExecutionResumeStore } from "@/stores/executionResumeStore";
import * as api from "@/services/tauri";
import type { TestRunsPage } from "@/types";
import { parseRateLimitError } from "@/stores/uiStore";
import { MiniStackedBar } from "@/components/charts/StatusCharts";
import { buildSlicesFromCounts } from "@/components/charts/status-utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { statusVariant } from "@/components/ui/badge-utils";
import { cn } from "@/components/ui/utils";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpDown,
  Bug,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock,
  HelpCircle,
  Info,
  Link2,
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
import { PageHelpButton } from "@/components/common/PageHelpModal";
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
  // Full summary from the batch API — used for the progress graph when not all
  // runs are loaded locally (avoids showing a partial/misleading chart).
  const execIds = useMemo(() => [execution.issue_id], [execution.issue_id]);
  const { data: batchSummaries } = useExecutionSummariesBatch(execIds);
  const batchSummary = batchSummaries?.[execution.issue_id];
  const { data: xrayStatuses } = useXrayStatuses(execution.project_id);
  const { data: xrayStepStatuses } = useStepStatuses(execution.project_id);
  const updateStatus = useUpdateTestRunStatus();
  const updateComment = useUpdateTestRunComment();
  const updateStepStatus = useUpdateTestRunStepStatus();
  const updateStep = useUpdateTestRunStep();
  const addTests = useAddTestsToTestExecution();
  const queryClient = useQueryClient();

  // Test-set membership data for the filter
  const {
    testSets,
    membership,
    setToTests,
    isLoading: membershipLoading,
  } = useTestSetMembership(contentProjectKey ?? null);

  // ── Fix version state ──────────────────────────────────────────────────────
  // Derive the Jira project key from the issue key (e.g. "PROJ-123" → "PROJ").
  const execProjectKey = execution.jira.key.split("-")[0] ?? null;
  const { data: projectVersions } = useProjectVersions(execProjectKey);
  const updateFixVersion = useUpdateExecutionFixVersion();
  const [versionPickerOpen, setVersionPickerOpen] = useState(false);
  const [versionSearch, setVersionSearch] = useState("");

  // ── Phase 1/2 — UX state ───────────────────────────────────────────────────
  const { data: config } = useConfig();
  const { recentByProject, addRecent } = useCommentTemplatesStore();
  const { lastRunByExecution, setLastRun } = useExecutionResumeStore();
  const [focusedRunId, setFocusedRunId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [resumeHighlightId, setResumeHighlightId] = useState<string | null>(null);
  const [autoOpenFailKit, setAutoOpenFailKit] = useState(
    () => localStorage.getItem("qality:autoOpenFailKit") !== "false",
  );
  useEffect(() => {
    localStorage.setItem("qality:autoOpenFailKit", String(autoOpenFailKit));
  }, [autoOpenFailKit]);
  const [bulkDefectOpen, setBulkDefectOpen] = useState(false);
  const [bulkDefectInput, setBulkDefectInput] = useState("");
  const [transitionOpen, setTransitionOpen] = useState(false);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const { data: execTransitions } = useIssueTransitions(execution.jira.key);
  const transitionIssue = useTransitionIssue();
  const updateAssignee = useUpdateAssignee();
  const { data: assigneeUserResults } = useSearchUsers(assigneeOpen ? assigneeSearch : "");

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
  /** Ref mirror of loadingAll so the async pump can check cancellation. */
  const loadingAllRef = useRef(false);
  /** Progress state for the Load-all pump — tracks pages and rate-limit stalls. */
  const [loadAllProgress, setLoadAllProgress] = useState<{
    currentPage: number;
    totalPages: number;
    startedAt: number;
    rateLimited: boolean;
  } | null>(null);
  /** Timeout handle for deferring the pump one tick so progress renders immediately. */
  const loadAllStartTimeoutRef = useRef<number | null>(null);
  /** Tracks whether the component is still mounted so the "Load all" pump can
   *  bail out instead of scheduling more fetches after unmount. */
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (loadAllStartTimeoutRef.current !== null) {
        window.clearTimeout(loadAllStartTimeoutRef.current);
      }
    };
  }, []);

  const stopLoadAll = useCallback(() => {
    loadingAllRef.current = false;
    if (loadAllStartTimeoutRef.current !== null) {
      window.clearTimeout(loadAllStartTimeoutRef.current);
      loadAllStartTimeoutRef.current = null;
    }
    setLoadingAll(false);
    setLoadAllProgress(null);
  }, []);

  /**
   * Load-all pump: calls Tauri directly (bypasses TanStack Query's retry layer)
   * and manually merges results into the infinite query cache.
   * This gives full control over progress tracking and error handling.
   */
  const startLoadAll = useCallback(() => {
    loadingAllRef.current = true;
    setLoadingAll(true);

    // Compute how many pages remain from current cache state
    const cachedPages = data?.pages ?? [];
    const loadedCount = cachedPages.reduce((sum, p) => sum + p.results.length, 0);
    const total = cachedPages[0]?.total ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / TEST_RUNS_PAGE_SIZE));
    const remaining = total - loadedCount;
    const pagesToFetch = Math.ceil(remaining / TEST_RUNS_PAGE_SIZE);
    let nextStart = loadedCount;
    const nextPageNumber = Math.floor(loadedCount / TEST_RUNS_PAGE_SIZE) + 1;

    if (pagesToFetch <= 0 || remaining <= 0) {
      stopLoadAll();
      return;
    }

    setLoadAllProgress({
      currentPage: nextPageNumber,
      totalPages,
      startedAt: Date.now(),
      rateLimited: false,
    });

    const pump = async () => {
      for (let page = 0; page < pagesToFetch; page++) {
        if (!mountedRef.current || !loadingAllRef.current) return;
        const pageNumber = Math.floor(nextStart / TEST_RUNS_PAGE_SIZE) + 1;

        setLoadAllProgress((prev) => ({
          currentPage: pageNumber,
          totalPages: prev?.totalPages ?? totalPages,
          startedAt: prev?.startedAt ?? Date.now(),
          rateLimited: false,
        }));

        try {
          const result: TestRunsPage = await api.getTestRunsLightweight(
            execution.issue_id,
            TEST_RUNS_PAGE_SIZE,
            nextStart,
          );

          if (!mountedRef.current || !loadingAllRef.current) return;

          // Merge the new page into TanStack Query's infinite query cache
          queryClient.setQueryData<InfiniteData<TestRunsPage>>(
            queryKeys.testRuns(execution.issue_id),
            (old) => {
              if (!old) return old;
              return {
                ...old,
                pages: [...old.pages, result],
                pageParams: [...old.pageParams, nextStart],
              };
            },
          );

          nextStart += result.results.length;

          // If this page had fewer results than expected, we've reached the end
          if (nextStart >= total || result.results.length < TEST_RUNS_PAGE_SIZE) {
            break;
          }
        } catch (err) {
          if (!mountedRef.current) return;
          stopLoadAll();
          showToast(setToast, `Failed to load tests: ${String(err)}`, "error");
          return;
        }
      }

      // Finished successfully
      if (mountedRef.current) stopLoadAll();
    };

    loadAllStartTimeoutRef.current = window.setTimeout(() => {
      loadAllStartTimeoutRef.current = null;
      void pump();
    }, 0);
  }, [data?.pages, execution.issue_id, queryClient, stopLoadAll]);

  // Listen for rate-limit events during Load-all to show in the banner
  useEffect(() => {
    if (!loadingAll) return;
    const unlisten = listen("xray:rate-limited", () => {
      setLoadAllProgress((prev) => (prev ? { ...prev, rateLimited: true } : null));
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [loadingAll]);

  // Tick elapsed time every second while load-all is active
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!loadingAll) return;
    const id = setInterval(() => setTick((t) => t + 1), 1_000);
    return () => clearInterval(id);
  }, [loadingAll]);

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

  // Size the virtualised list from the available viewport space instead of
  // the parent's current height. Observing the parent height here can create
  // a feedback loop where the list grows with its container and leaves a huge
  // empty scroll area.
  useEffect(() => {
    const updateListHeight = () => {
      const el = parentRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      const available = window.innerHeight - top - 96;
      setListHeight(Math.max(240, available));
    };

    updateListHeight();
    window.addEventListener("resize", updateListHeight);
    return () => window.removeEventListener("resize", updateListHeight);
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
  // Only fetch test sets when the panel is open — same gating as tests.
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

  // ── Runs / execution-data helpers ───────────────────────────────────────────
  // Flatten all pages into a single runs array
  const runs = useMemo(() => data?.pages.flatMap((page) => page.results) ?? [], [data]);

  // Set of test issue_ids already present in this execution
  const testsAlreadyInExecution = useMemo(
    () => new Set(runs.map((run) => run.test.issue_id)),
    [runs],
  );

  // Set of test-set issue_ids that have at least one test in this execution
  const testSetIssueIdsInExecution = useMemo(
    () =>
      new Set(
        runs.flatMap((run) => (membership.get(run.test.issue_id) ?? []).map((m) => m.issueId)),
      ),
    [runs, membership],
  );

  // ── Add-tests panel handlers ───────────────────────────────────────────────
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

  /** Add tests from a set that are not already in the execution (synchronous — uses setToTests from batch membership query, zero extra API calls). */
  const handleSelectFromSet = useCallback(
    (setIssueId: string) => {
      setLoadingSetId(setIssueId);
      try {
        const testIds = setToTests.get(setIssueId);
        if (!testIds || testIds.length === 0) {
          showToast(setToast, "This test set has no tests to add.", "success");
          return;
        }
        const newIds = testIds.filter((id) => !testsAlreadyInExecution.has(id));
        if (newIds.length === 0) {
          showToast(setToast, "All tests from this set are already in the execution.", "success");
          return;
        }
        setSelectedTestIds((prev) => {
          const next = new Set(prev);
          for (const id of newIds) next.add(id);
          return next;
        });
        setAddTab("tests");
      } finally {
        setLoadingSetId(null);
      }
    },
    [setToTests, testsAlreadyInExecution],
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

  const toggleExpanded = useCallback(
    (runId: string) => {
      setLastRun(execution.issue_id, runId);
      setExpandedRuns((prev) => {
        const next = new Set(prev);
        if (next.has(runId)) {
          next.delete(runId);
        } else {
          next.add(runId);
        }
        return next;
      });
    },
    [execution.issue_id, setLastRun],
  );

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

  // Track the rendered virtual row structure so we can remeasure when
  // sections are collapsed/expanded or rows are added/removed/reordered,
  // without reacting to pure status/comment refreshes.
  const virtualRowKeys = useMemo(
    () =>
      virtualRows
        .map((item) => (item.type === "header" ? `h:${item.setIssueId}` : `r:${item.run.id}`))
        .join(","),
    [virtualRows],
  );
  const expandedRunKeys = useMemo(() => [...expandedRuns].sort().join(","), [expandedRuns]);

  // Force a height recomputation whenever the rendered structure changes or
  // expanded rows toggle. Without this, the virtualizer can keep stale
  // measurements and leave extra empty scroll space below the last row.
  useEffect(() => {
    virtualizer.measure();
  }, [virtualRowKeys, expandedRunKeys, virtualizer]);

  // Pagination is entirely user-driven (Load more / Load all buttons in the footer).
  // Auto-fetching on scroll is intentionally disabled to avoid hammering the Xray API,
  // especially when a status filter is active and each new page triggers an extra call.
  const virtualItems = virtualizer.getVirtualItems();
  const scrollAreaHeight = Math.min(listHeight, Math.max(virtualizer.getTotalSize(), 1));

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
      setLastRun(execution.issue_id, run.id);
      if (autoOpenFailKit && ["FAIL", "FAILED"].includes(newStatus.toUpperCase())) {
        setActiveComment(run.id);
        setCommentValue(run.comment ?? "");
        setDefectPickerOpen(run.id);
        setDefectInputValue("");
      }
    },
    [updateStatus, execution.issue_id, addSavingKey, removeSavingKey, autoOpenFailKit, setLastRun],
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
      addRecent(execProjectKey ?? "", commentValue);
      setActiveComment(null);
      setCommentValue("");
    },
    [
      updateComment,
      commentValue,
      execution.issue_id,
      addSavingKey,
      removeSavingKey,
      addRecent,
      execProjectKey,
    ],
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

  // ── Phase 1/2 — derived helpers, callbacks, effects ─────────────────────────
  const visibleRunItems = useMemo(
    () =>
      virtualRows.filter(
        (item): item is { type: "run"; run: TestRun; sectionId: string } => item.type === "run",
      ),
    [virtualRows],
  );

  const focusRun = useCallback(
    (runId: string) => {
      setFocusedRunId(runId);
      setLastRun(execution.issue_id, runId);
      const vIdx = virtualRows.findIndex((r) => r.type === "run" && r.run.id === runId);
      if (vIdx >= 0) virtualizer.scrollToIndex(vIdx, { align: "center" });
    },
    [execution.issue_id, setLastRun, virtualRows, virtualizer],
  );

  const jumpToStatus = useCallback(
    (statusNames: string[]) => {
      const upperNames = statusNames.map((s) => s.toUpperCase());
      const matchingItems = visibleRunItems.filter((item) =>
        upperNames.includes(item.run.status.name.toUpperCase()),
      );
      if (matchingItems.length === 0) return;
      const currentIdx = matchingItems.findIndex((item) => item.run.id === focusedRunId);
      const nextIdx = (currentIdx + 1) % matchingItems.length;
      const next = matchingItems[nextIdx];
      if (next) focusRun(next.run.id);
    },
    [visibleRunItems, focusedRunId, focusRun],
  );

  const copyTestLink = useCallback(
    (jiraKey: string) => {
      const base = (config?.jira_url ?? "").replace(/\/$/, "");
      const url = `${base}/browse/${jiraKey}`;
      void navigator.clipboard.writeText(url).then(() => {
        showToast(setToast, "Link copied to clipboard", "success");
      });
    },
    [config?.jira_url],
  );

  const handleBulkDefect = useCallback(async () => {
    const keys = bulkDefectInput
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    if (keys.length === 0) return;
    const ids = [...selectedRunIds];
    setBulkDefectOpen(false);
    setBulkDefectInput("");
    setSelectedRunIds(new Set());
    setIsSelectMode(false);
    for (const id of ids) {
      const key = `run:${id}`;
      addSavingKey(key);
      try {
        await addDefects.mutateAsync({
          testRunId: id,
          issueKeys: keys,
          executionIssueId: execution.issue_id,
        });
      } catch (err) {
        showToast(setToast, `Failed to link defect: ${String(err)}`, "error");
      } finally {
        removeSavingKey(key);
      }
    }
  }, [
    bulkDefectInput,
    selectedRunIds,
    addDefects,
    execution.issue_id,
    addSavingKey,
    removeSavingKey,
  ]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const items = visibleRunItems;
      const currentIdx = items.findIndex((it) => it.run.id === focusedRunId);

      const move = (delta: number) => {
        if (items.length === 0) return;
        const nextIdx =
          currentIdx < 0
            ? delta > 0
              ? 0
              : items.length - 1
            : (currentIdx + delta + items.length) % items.length;
        const next = items[nextIdx];
        if (next) focusRun(next.run.id);
      };

      const focusedRun = currentIdx >= 0 ? (items[currentIdx]?.run ?? null) : null;

      switch (event.key) {
        case "ArrowDown":
        case "j":
          event.preventDefault();
          move(1);
          return;
        case "ArrowUp":
        case "k":
          event.preventDefault();
          move(-1);
          return;
        case "Escape":
          setFocusedRunId(null);
          return;
        case "?":
          event.preventDefault();
          setHelpOpen((prev) => !prev);
          return;
        case "n":
          event.preventDefault();
          jumpToStatus(["TODO"]);
          return;
        case "f":
          event.preventDefault();
          jumpToStatus(["FAIL", "FAILED"]);
          return;
        default:
          break;
      }

      if (!focusedRun) return;

      if (event.key >= "1" && event.key <= "9") {
        const idx = Number(event.key) - 1;
        const targetStatus = statuses[idx];
        if (targetStatus) {
          event.preventDefault();
          handleStatusChange(focusedRun, targetStatus.name);
        }
        return;
      }

      switch (event.key) {
        case "c":
          event.preventDefault();
          setActiveComment(focusedRun.id);
          setCommentValue(focusedRun.comment ?? "");
          setLastRun(execution.issue_id, focusedRun.id);
          return;
        case "d":
          event.preventDefault();
          setDefectPickerOpen(focusedRun.id);
          setDefectInputValue("");
          setLastRun(execution.issue_id, focusedRun.id);
          return;
        case "Enter": {
          const isCucumber =
            focusedRun.test_type?.name?.toLowerCase() === "cucumber" || !!focusedRun.gherkin;
          const isManual =
            focusedRun.test_type?.name?.toLowerCase() === "manual" ||
            (!focusedRun.test_type && !isCucumber);
          if (isManual || isCucumber) {
            event.preventDefault();
            toggleExpanded(focusedRun.id);
            setLastRun(execution.issue_id, focusedRun.id);
          }
          return;
        }
        default:
          return;
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [
    visibleRunItems,
    focusedRunId,
    statuses,
    focusRun,
    handleStatusChange,
    jumpToStatus,
    execution.issue_id,
    setLastRun,
    toggleExpanded,
  ]);

  // Resume marker — scroll to last-touched run on first load
  const resumedRef = useRef(false);
  useEffect(() => {
    if (resumedRef.current || runs.length === 0) return;
    const lastRunId = lastRunByExecution[execution.issue_id];
    if (!lastRunId) return;
    if (!runs.some((r) => r.id === lastRunId)) return;
    resumedRef.current = true;
    setFocusedRunId(lastRunId);
    setResumeHighlightId(lastRunId);
    const vIdx = virtualRows.findIndex((r) => r.type === "run" && r.run.id === lastRunId);
    if (vIdx >= 0) {
      setTimeout(() => virtualizer.scrollToIndex(vIdx, { align: "center" }), 100);
    }
    setTimeout(() => setResumeHighlightId(null), 5000);
  }, [runs, execution.issue_id, lastRunByExecution, virtualRows, virtualizer]);

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
            {membershipLoading && <p className="text-xs text-slate-400">Loading test set data…</p>}
            <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 dark:border-slate-600 dark:bg-slate-800">
              <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <input
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
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
                      const inExecution = testSetIssueIdsInExecution.has(ts.issue_id);
                      const setTestIds = setToTests.get(ts.issue_id);
                      const totalCount = setTestIds?.length ?? 0;
                      const presentCount = setTestIds
                        ? setTestIds.filter((id) => testsAlreadyInExecution.has(id)).length
                        : 0;
                      const fullyIncluded = totalCount > 0 && presentCount === totalCount;
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
                            {inExecution && totalCount > 0 && (
                              <span
                                className={cn(
                                  "ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                                  fullyIncluded
                                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                    : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                                )}
                              >
                                {presentCount}/{totalCount} already added
                              </span>
                            )}
                          </div>
                          <button
                            disabled={
                              isLoading ||
                              loadingSetId !== null ||
                              fullyIncluded ||
                              membershipLoading
                            }
                            onClick={() => handleSelectFromSet(ts.issue_id)}
                            className={cn(
                              "flex shrink-0 items-center gap-1 rounded border px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50",
                              fullyIncluded
                                ? "border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400"
                                : inExecution && presentCount !== null
                                  ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400 dark:hover:bg-amber-900/40"
                                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300",
                            )}
                          >
                            {isLoading ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : fullyIncluded ? (
                              <CheckCheck className="h-3 w-3" />
                            ) : (
                              <Plus className="h-3 w-3" />
                            )}
                            {fullyIncluded ? "All added" : inExecution ? "Add remaining" : "Select"}
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
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
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
                      const alreadyThere = testsAlreadyInExecution.has(test.issue_id);
                      const checked = !alreadyThere && selectedTestIds.has(test.issue_id);
                      return (
                        <li key={test.issue_id}>
                          <label
                            className={cn(
                              "flex items-start gap-3 px-3 py-2",
                              alreadyThere
                                ? "cursor-default opacity-50"
                                : "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/40",
                            )}
                          >
                            {alreadyThere ? (
                              <CheckCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                            ) : (
                              <input
                                type="checkbox"
                                className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600"
                                checked={checked}
                                onChange={() => toggleSelectedTest(test.issue_id)}
                              />
                            )}
                            <div className="min-w-0">
                              <span className="mr-1.5 font-mono text-xs text-slate-500">
                                {test.jira.key}
                              </span>
                              <span className="text-sm text-slate-800 dark:text-slate-200">
                                {test.jira.summary}
                              </span>
                              {alreadyThere && (
                                <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400">
                                  already added
                                </span>
                              )}
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

  // ── Progress summary ────────────────────────────────────────────────────────
  // When not all runs are loaded locally we use the batch summary (from a
  // lightweight server call) so the graph always shows the full picture.
  // Once everything is loaded we switch to the local filteredRuns data so status
  // filters are reflected instantly.
  const allRunsLoaded = !hasNextPage;
  const summaryTotal = useMemo(() => {
    if (allRunsLoaded) return filteredRuns.length;
    return batchSummary?.total ?? totalFromServer;
  }, [allRunsLoaded, filteredRuns.length, batchSummary, totalFromServer]);

  const summarySlices = useMemo(() => {
    if (allRunsLoaded) {
      // All pages loaded — compute from local data (respects search/filter).
      const rawCounts = filteredRuns.reduce<Record<string, number>>((acc, run) => {
        const name = run.status.name.toUpperCase();
        acc[name] = (acc[name] ?? 0) + 1;
        return acc;
      }, {});
      return buildSlicesFromCounts(rawCounts, filteredRuns.length);
    }
    // Use batch summary from the server (full picture, no filter applied).
    if (batchSummary) {
      return buildSlicesFromCounts(batchSummary.counts, batchSummary.total);
    }
    // Fallback while batch is still loading — use whatever local runs we have.
    const rawCounts = runs.reduce<Record<string, number>>((acc, run) => {
      const name = run.status.name.toUpperCase();
      acc[name] = (acc[name] ?? 0) + 1;
      return acc;
    }, {});
    return buildSlicesFromCounts(rawCounts, runs.length);
  }, [allRunsLoaded, filteredRuns, batchSummary, runs]);

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
            <button
              title={`Copy Jira link for ${execution.jira.key}`}
              onClick={() => copyTestLink(execution.jira.key)}
              className="rounded p-0.5 text-slate-400 hover:text-slate-600"
            >
              <Link2 className="h-3.5 w-3.5" />
            </button>
            {/* Execution status pill with transition dropdown */}
            {execution.jira.status && (
              <div className="relative">
                <button
                  onClick={() => setTransitionOpen((v) => !v)}
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  <span className="text-slate-400">status:</span>
                  <span className="font-medium text-slate-600 dark:text-slate-300">
                    {execution.jira.status.name}
                  </span>
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </button>
                {transitionOpen && execTransitions && execTransitions.length > 0 && (
                  <div className="absolute left-0 top-full z-20 mt-1 w-48 rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
                    {execTransitions.map((t) => (
                      <button
                        key={t.id}
                        className="flex w-full items-center px-3 py-1.5 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-700"
                        onClick={() => {
                          setTransitionOpen(false);
                          transitionIssue.mutate({
                            issueKey: execution.jira.key,
                            transitionId: t.id,
                            executionProjectKey: execProjectKey ?? "",
                            toStatusName: t.to?.name ?? t.name,
                          });
                        }}
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Assignee picker */}
            <div className="relative">
              <button
                onClick={() => {
                  setAssigneeOpen((v) => !v);
                  setAssigneeSearch("");
                }}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                title="Set assignee"
              >
                <span className="text-slate-400">assignee:</span>
                <span className="font-medium text-slate-600 dark:text-slate-300">
                  {execution.jira.assignee?.display_name ?? "Unassigned"}
                </span>
                <Pencil className="h-3 w-3 opacity-50" />
              </button>
              {assigneeOpen && (
                <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
                  <div className="p-1.5">
                    <input
                      autoFocus
                      placeholder="Search users…"
                      value={assigneeSearch}
                      onChange={(e) => setAssigneeSearch(e.target.value)}
                      className="w-full rounded border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    <button
                      className="flex w-full items-center px-3 py-1.5 text-left text-xs text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
                      onClick={() => {
                        setAssigneeOpen(false);
                        updateAssignee.mutate({
                          issueKey: execution.jira.key,
                          executionProjectKey: execProjectKey ?? "",
                        });
                      }}
                    >
                      — Unassign —
                    </button>
                    {(assigneeUserResults ?? []).map((u) => (
                      <button
                        key={u.account_id}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-700"
                        onClick={() => {
                          setAssigneeOpen(false);
                          updateAssignee.mutate({
                            issueKey: execution.jira.key,
                            accountId: u.account_id,
                            executionProjectKey: execProjectKey ?? "",
                            displayName: u.display_name,
                          });
                        }}
                      >
                        <span>{u.display_name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
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
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
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
                            versionName: v.name,
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
        </div>
      )}
      {addTestsPanel && <div className="mb-3">{addTestsPanel}</div>}

      {runs.length > 0 && (
        <>
          {/* Sticky toolbar: filters + progress + status filter */}
          <div className="sticky top-0 z-10 -mx-1 border-b border-slate-200 bg-white/95 px-1 pb-2 shadow-[0_2px_8px_-4px_rgba(15,23,42,0.08)] backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
            <div className="mb-2 space-y-2">
              {/* Key / name search + sort toggle + jump buttons + add tests */}
              <div className="flex items-center gap-2">
                <div className="flex flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                  <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <input
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
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
                  onClick={() => jumpToStatus(["FAIL", "FAILED"])}
                  title="Jump to next FAIL run"
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                </button>
                <button
                  onClick={() => jumpToStatus(["TODO"])}
                  title="Jump to next TODO run"
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                </button>
                <button
                  onClick={() => setAutoOpenFailKit((prev) => !prev)}
                  title={
                    autoOpenFailKit
                      ? "Auto fail-kit: ON (click to disable)"
                      : "Auto fail-kit: OFF (click to enable)"
                  }
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium shadow-sm transition-colors",
                    autoOpenFailKit
                      ? "border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950/40 dark:text-red-300"
                      : "border-slate-200 bg-white text-slate-400 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700",
                  )}
                >
                  <Bug className="h-3.5 w-3.5" />
                  {autoOpenFailKit ? "Kit on" : "Kit off"}
                </button>
                <span
                  className="mx-0.5 h-6 w-px shrink-0 bg-slate-200 dark:bg-slate-700"
                  aria-hidden
                />
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
                <span
                  className="mx-0.5 h-6 w-px shrink-0 bg-slate-200 dark:bg-slate-700"
                  aria-hidden
                />
                <button
                  onClick={() => setHelpOpen(true)}
                  title="Help & keyboard shortcuts (press ?)"
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  aria-label="Help"
                >
                  <HelpCircle className="h-3.5 w-3.5 text-blue-500" />
                </button>
              </div>
            </div>

            {/* Progress summary */}
            <div className="mb-2 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <p className="mb-1.5 truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                {execution.jira.summary}
              </p>
              <div className="mb-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span className="font-medium">
                  {summaryTotal} test{summaryTotal !== 1 ? "s" : ""}
                  {!allRunsLoaded && ` (${runs.length} loaded)`}
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
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Filter:
              </span>
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
          </div>

          {/* Help modal — driven by toolbar button or `?` shortcut */}
          <PageHelpButton
            pageId="execution-detail"
            open={helpOpen}
            onOpenChange={setHelpOpen}
            hideTrigger
          />

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

            {/* Pagination banner — prominent notice when not all tests are loaded */}
            {(hasNextPage || loadingAll) && (
              <div
                className={cn(
                  "flex items-center gap-3 border-b px-4 py-2.5",
                  loadAllProgress?.rateLimited
                    ? "border-amber-100 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30"
                    : "border-blue-100 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-950/30",
                )}
              >
                {loadAllProgress?.rateLimited ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-500 dark:text-amber-400" />
                ) : (
                  <Info className="h-4 w-4 shrink-0 text-blue-500 dark:text-blue-400" />
                )}
                <span
                  className={cn(
                    "flex-1 text-sm",
                    loadAllProgress?.rateLimited
                      ? "text-amber-700 dark:text-amber-300"
                      : "text-blue-700 dark:text-blue-300",
                  )}
                >
                  {loadingAll && loadAllProgress ? (
                    <>
                      <Loader2 className="mr-1.5 inline h-3.5 w-3.5 animate-spin" />
                      {loadAllProgress.rateLimited ? (
                        <>
                          Rate limited — waiting for API cooldown… Page{" "}
                          <strong>
                            {loadAllProgress.currentPage}/{loadAllProgress.totalPages}
                          </strong>{" "}
                          · <strong>{runs.length}</strong> of <strong>{totalFromServer}</strong>{" "}
                          loaded · {Math.round((Date.now() - loadAllProgress.startedAt) / 1000)}s
                          elapsed
                        </>
                      ) : (
                        <>
                          Loading page{" "}
                          <strong>
                            {loadAllProgress.currentPage}/{loadAllProgress.totalPages}
                          </strong>{" "}
                          · <strong>{runs.length}</strong> of <strong>{totalFromServer}</strong>{" "}
                          tests loaded ·{" "}
                          {Math.round((Date.now() - loadAllProgress.startedAt) / 1000)}s elapsed
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      Showing <strong>{runs.length}</strong> of <strong>{totalFromServer}</strong>{" "}
                      tests. {totalFromServer - runs.length} more available.
                    </>
                  )}
                </span>
                {!loadingAll && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void fetchNextPage()}
                      disabled={isFetchingNextPage}
                      className="h-7 text-xs"
                    >
                      {isFetchingNextPage ? (
                        <>
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          Loading…
                        </>
                      ) : (
                        `Load next ${Math.min(TEST_RUNS_PAGE_SIZE, totalFromServer - runs.length)}`
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={startLoadAll}
                      disabled={isFetchingNextPage}
                      className="h-7 text-xs"
                    >
                      Load all ({totalFromServer - runs.length} remaining)
                    </Button>
                  </div>
                )}
                {loadingAll && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={stopLoadAll}
                    className={cn(
                      "h-7 text-xs",
                      loadAllProgress?.rateLimited
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-blue-600 dark:text-blue-400",
                    )}
                  >
                    Stop
                  </Button>
                )}
              </div>
            )}

            {/* Virtualised rows */}
            <div ref={parentRef} className="overflow-auto" style={{ height: scrollAreaHeight }}>
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
                        className="bg-white dark:bg-slate-800"
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
                  const isCucumber =
                    run.test_type?.name?.toLowerCase() === "cucumber" || !!run.gherkin;
                  // With lightweight data, steps may not be loaded yet —
                  // assume all Manual/Cucumber tests are expandable
                  const isManual =
                    run.test_type?.name?.toLowerCase() === "manual" ||
                    (!run.test_type && !isCucumber);
                  const hasSteps = isManual || isCucumber;
                  const isExpanded = expandedRuns.has(run.id);

                  return (
                    <div
                      key={run.id}
                      data-index={virtualRow.index}
                      ref={virtualizer.measureElement}
                      className={cn("bg-white dark:bg-slate-800", isExpanded && "z-[1]")}
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
                          focusedRunId === run.id &&
                            "ring-2 ring-blue-400 bg-blue-50/40 dark:bg-blue-900/20",
                          resumeHighlightId === run.id && "animate-pulse",
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
                                    : run.steps
                                      ? `${run.steps.length} step${run.steps.length !== 1 ? "s" : ""}`
                                      : "Manual"}
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

                        {/* Comment toggle + copy link */}
                        <div className="flex items-center gap-1">
                          <button
                            title={run.comment ? `Comment: ${run.comment}` : "Add comment"}
                            onClick={() => {
                              if (activeComment === run.id) {
                                setActiveComment(null);
                              } else {
                                setActiveComment(run.id);
                                setCommentValue(run.comment ?? "");
                                setLastRun(execution.issue_id, run.id);
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

                          {/* Copy Jira link */}
                          <button
                            title={`Copy Jira link for ${run.test.jira.key}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              copyTestLink(run.test.jira.key);
                            }}
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
                          >
                            <Link2 className="h-4 w-4" />
                          </button>
                        </div>

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
                                  autoCorrect="off"
                                  autoCapitalize="off"
                                  spellCheck={false}
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
                        <div className="flex flex-col gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2 dark:border-slate-700 dark:bg-slate-700/40">
                          {(recentByProject[execProjectKey ?? ""] ?? []).slice(0, 5).length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[10px] text-slate-400">Recent:</span>
                              {(recentByProject[execProjectKey ?? ""] ?? [])
                                .slice(0, 5)
                                .map((c, i) => (
                                  <button
                                    key={i}
                                    onClick={() => setCommentValue(c)}
                                    title={c}
                                    className="max-w-[200px] truncate rounded border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                                  >
                                    {c.length > 50 ? c.slice(0, 50) + "…" : c}
                                  </button>
                                ))}
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <input
                              autoCorrect="off"
                              autoCapitalize="off"
                              spellCheck={false}
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
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setActiveComment(null)}
                            >
                              Cancel
                            </Button>
                          </div>
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
              {(hasNextPage || loadingAll) && (
                <div className="flex items-center gap-2">
                  {!loadingAll && (
                    <>
                      <button
                        onClick={() => void fetchNextPage()}
                        disabled={isFetchingNextPage || loadingAll}
                        className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-700"
                      >
                        {isFetchingNextPage ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Loading…
                          </>
                        ) : (
                          `Load next ${Math.min(TEST_RUNS_PAGE_SIZE, totalFromServer - runs.length)}`
                        )}
                      </button>

                      <button
                        onClick={startLoadAll}
                        disabled={isFetchingNextPage}
                        className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-700"
                      >
                        Load all ({totalFromServer - runs.length} remaining)
                      </button>
                    </>
                  )}
                  {loadingAll && (
                    <button
                      onClick={stopLoadAll}
                      className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
                    >
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {runs.length} / {totalFromServer} · Stop
                    </button>
                  )}
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
              <div className="mx-1 h-4 w-px bg-slate-200 dark:bg-slate-700" />
              {bulkDefectOpen ? (
                <div className="flex items-center gap-1.5">
                  <input
                    autoFocus
                    value={bulkDefectInput}
                    onChange={(e) => setBulkDefectInput(e.target.value)}
                    placeholder="BUG-1, BUG-2"
                    className="w-36 rounded border border-slate-200 px-2 py-0.5 text-xs focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") void handleBulkDefect();
                      if (e.key === "Escape") {
                        setBulkDefectOpen(false);
                        setBulkDefectInput("");
                      }
                    }}
                  />
                  <button
                    onClick={() => void handleBulkDefect()}
                    className="rounded bg-slate-800 px-2 py-0.5 text-xs text-white hover:bg-slate-700 dark:bg-slate-600"
                  >
                    Apply
                  </button>
                  <button
                    onClick={() => {
                      setBulkDefectOpen(false);
                      setBulkDefectInput("");
                    }}
                    className="rounded px-2 py-0.5 text-xs text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  title="Link defect to all selected"
                  onClick={() => setBulkDefectOpen(true)}
                  className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-500 dark:hover:bg-slate-700"
                >
                  <Bug className="h-3.5 w-3.5" />
                </button>
              )}
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
  // Lazy-load full run details (steps, iterations, Gherkin, evidence)
  const {
    data: detail,
    isLoading,
    isError,
    error,
  } = useTestRunDetail(run.test.issue_id, executionIssueId);

  // Merge: use fetched detail if available, else fall back to the (possibly slim) run
  const fullRun = detail ?? run;

  const isCucumber = fullRun.test_type?.name?.toLowerCase() === "cucumber" || !!fullRun.gherkin;
  const hasManualSteps = (fullRun.steps?.length ?? 0) > 0;

  const handleStepStatusChange = useCallback(
    (step: TestRunStep, status: string) => onStepStatusChange(fullRun, step, status),
    [fullRun, onStepStatusChange],
  );
  const handleSaveStepField = useCallback(
    (step: TestRunStep, field: "comment" | "actualResult", value: string) =>
      onSaveStepField(fullRun, step, field, value),
    [fullRun, onSaveStepField],
  );
  const handleBulkStepStatus = useCallback(
    (status: string) => onBulkStepStatus(fullRun, status),
    [fullRun, onBulkStepStatus],
  );

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-6 py-4 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading test details…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="px-6 py-4 text-sm text-red-500">Failed to load details: {String(error)}</div>
    );
  }

  if (!hasManualSteps && !isCucumber) {
    return (
      <div className="px-6 py-3 text-sm text-slate-400 italic">No steps defined for this test.</div>
    );
  }

  return (
    <>
      {isCucumber && <GherkinPanel gherkin={fullRun.gherkin} results={fullRun.results} />}
      {hasManualSteps && (
        <StepsPanel
          run={fullRun}
          steps={fullRun.steps!}
          stepStatuses={stepStatuses}
          onStepStatusChange={handleStepStatusChange}
          onSaveStepField={handleSaveStepField}
          onBulkStepStatus={handleBulkStepStatus}
          isPending={isPending}
          isSaving={isSaving}
          savingKeys={savingKeys}
        />
      )}
      {hasManualSteps && (fullRun.iterations?.results.length ?? 0) > 0 && (
        <IterationsPanel
          testRunId={fullRun.id}
          iterations={fullRun.iterations!.results}
          steps={fullRun.steps!}
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
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
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
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
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
