import { useCallback, useEffect, useMemo } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";
import type {
  TestExecution,
  TestPlan,
  TestRun,
  TestRunIteration,
  TestRunsPage,
  TestSetMemberInfo,
  XrayStepStatus,
  XrayTest,
  XrayTestDetail,
  XrayTestRunStatus,
  XrayTestSet,
  XrayTestWithStatus,
} from "@/types";
import * as api from "../tauri";
import { queryKeys, TEST_RUNS_PAGE_SIZE } from "./queryKeys";

// ── Tests streaming state (module-level, survives component unmounts) ──────────
//
// Tracks which project keys are currently being streamed ('streaming') or have
// finished ('done').  A single Tauri event listener handles all projects so we
// never register duplicates even if the hook mounts in multiple components.

type StreamState = "streaming" | "done";
const testStreamMap = new Map<string, StreamState>();
let testsPageUnlisten: (() => void) | null = null;
// Promise guard: if registration is already in-flight, subsequent callers
// await the same promise instead of calling listen() a second time.
let testsPageSetupPromise: Promise<void> | null = null;

async function ensureTestsListener(queryClient: QueryClient) {
  if (testsPageUnlisten) return; // listener already active
  if (!testsPageSetupPromise) {
    // Set the promise synchronously so any concurrent caller sees it immediately
    // and awaits it instead of registering a second listener.
    testsPageSetupPromise = listen<{ project_key: string; tests: XrayTest[]; done: boolean }>(
      "tests:page",
      (event) => {
        const { project_key, tests, done } = event.payload;
        // Always call setQueryData so React re-renders on every batch including the final done signal.
        queryClient.setQueryData<XrayTest[]>(queryKeys.tests(project_key), (prev) =>
          tests.length > 0 ? [...(prev ?? []), ...tests] : (prev ?? []),
        );
        if (done) {
          testStreamMap.set(project_key, "done");
        }
      },
    ).then((unlisten) => {
      testsPageUnlisten = unlisten;
    });
  }
  await testsPageSetupPromise;
}

// ── Test Plans ────────────────────────────────────────────────────────────────

export function useTestPlans(projectKey: string | null) {
  return useQuery<TestPlan[]>({
    queryKey: queryKeys.testPlans(projectKey!),
    queryFn: () => api.getTestPlans(projectKey!),
    enabled: !!projectKey,
    staleTime: 5 * 60 * 1_000,
    gcTime: Infinity,
    meta: { persist: true },
  });
}

// ── Test Executions ───────────────────────────────────────────────────────────

export function useTestExecutions(projectKey: string | null) {
  return useQuery<TestExecution[]>({
    queryKey: queryKeys.testExecutions(projectKey!),
    queryFn: () => api.getTestExecutions(projectKey!),
    enabled: !!projectKey,
    staleTime: 5 * 60 * 1_000, // 5 minutes
    gcTime: Infinity,
    meta: { persist: true },
  });
}

// ── Test Executions by Version ────────────────────────────────────────────────

/** Fetch test executions in a project filtered by a specific fix version. */
export function useTestExecutionsByVersion(projectKey: string | null, versionName: string | null) {
  return useQuery<TestExecution[]>({
    queryKey: queryKeys.testExecutionsByVersion(projectKey!, versionName!),
    queryFn: () => api.getTestExecutionsByVersion(projectKey!, versionName!),
    enabled: !!projectKey && !!versionName,
    staleTime: 5 * 60 * 1_000,
    gcTime: Infinity,
    meta: { persist: true },
  });
}

// ── Test Runs (infinite/paginated) ────────────────────────────────────────────

export function useTestRuns(executionIssueId: string | null) {
  return useInfiniteQuery<
    TestRunsPage,
    Error,
    InfiniteData<TestRunsPage>,
    readonly string[],
    number
  >({
    queryKey: queryKeys.testRuns(executionIssueId ?? ""),
    queryFn: ({ pageParam }) =>
      api.getTestRunsLightweight(executionIssueId!, TEST_RUNS_PAGE_SIZE, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      const start = lastPage.start ?? 0;
      const fetched = lastPage.results.length;
      const nextStart = start + fetched;
      // No more pages if we've fetched everything
      if (nextStart >= lastPage.total) return undefined;
      return nextStart;
    },
    enabled: !!executionIssueId,
    staleTime: 5 * 60 * 1_000, // mutations handle optimistic updates
    gcTime: Infinity,
    // Rust backend already retries rate-limited requests (up to 10×).
    // Disabling TQ retries prevents compounding waits during Load-all pump.
    retry: false,
    meta: { persist: true },
  });
}

// ── Single test run detail (lazy, on-demand) ──────────────────────────────────

/**
 * Fetches full details for a single test run (steps, iterations, Gherkin,
 * evidence, Cucumber results). Only fires when the user expands a row,
 * providing `testIssueId` and `execIssueId`. Cached indefinitely since
 * details are immutable for completed runs.
 */
export function useTestRunDetail(testIssueId: string | null, execIssueId: string | null) {
  return useQuery<TestRun | null>({
    queryKey: queryKeys.testRunDetail(testIssueId ?? "", execIssueId ?? ""),
    queryFn: () => api.getSingleTestRun(testIssueId!, execIssueId!),
    enabled: !!testIssueId && !!execIssueId,
    staleTime: 5 * 60 * 1_000,
    gcTime: Infinity,
  });
}

// ── Iteration step results (lazy, per test run) ───────────────────────────────

/**
 * Fetches step results for all iterations of a single test run.
 * Only enabled when `testRunId` is provided (i.e. the user has expanded a run
 * that has iterations). Results are cached indefinitely within the session since
 * iteration step results are effectively immutable once a test execution is done.
 */
export function useIterationStepResults(testRunId: string | null) {
  return useQuery<TestRunIteration[]>({
    queryKey: queryKeys.iterationStepResults(testRunId ?? ""),
    queryFn: () => api.getIterationStepResults(testRunId!),
    enabled: !!testRunId,
    staleTime: Infinity, // step results are immutable once a test execution is done
    gcTime: Infinity,
    meta: { persist: true },
  });
}

// ── Xray statuses ─────────────────────────────────────────────────────────────

export function useXrayStatuses(projectId: string | null) {
  return useQuery<XrayTestRunStatus[]>({
    queryKey: queryKeys.xrayStatuses(projectId ?? ""),
    queryFn: () => api.getXrayStatuses(projectId!),
    enabled: !!projectId,
    staleTime: Infinity, // statuses are project configuration — only change when admin edits them
    gcTime: Infinity,
    meta: { persist: true },
  });
}

// ── Step statuses ─────────────────────────────────────────────────────────────

export function useStepStatuses(projectId: string | null) {
  return useQuery<XrayStepStatus[]>({
    queryKey: queryKeys.stepStatuses(projectId ?? ""),
    queryFn: () => api.getStepStatuses(projectId!),
    enabled: !!projectId,
    staleTime: Infinity, // step statuses are project configuration — rarely change
    gcTime: Infinity,
    meta: { persist: true },
  });
}

// ── Get Tests ─────────────────────────────────────────────────────────────────

/**
 * Fetches tests for the given project key.
 *
 * Page 1 is returned immediately so the UI can render without delay.
 * Remaining pages arrive as `tests:page` Tauri events emitted by a background
 * Rust task — a module-level listener appends each batch to the cache so the
 * list grows progressively.  The listener persists across component unmounts so
 * navigating away does NOT cancel the in-flight fetch.
 */
export function useGetTests(projectKey: string | undefined, enabled = true) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!projectKey || !enabled) return;
    // Don't start a second stream if one is already running or finished.
    if (testStreamMap.has(projectKey)) return;
    // If we already have cached data it came from localStorage — treat as done.
    const cached = queryClient.getQueryData<XrayTest[]>(queryKeys.tests(projectKey));
    if (cached && cached.length > 0) {
      testStreamMap.set(projectKey, "done");
      return;
    }
    testStreamMap.set(projectKey, "streaming");
    // Wire up the global listener (no-op if already set up).
    void ensureTestsListener(queryClient);
    // The queryFn below will trigger the actual backend call.
    // Intentionally no cleanup return — the stream continues in the background.
  }, [projectKey, enabled, queryClient]);

  return useQuery<XrayTest[]>({
    queryKey: queryKeys.tests(projectKey!),
    queryFn: () => api.getTests(projectKey!),
    enabled: !!projectKey && enabled,
    staleTime: Infinity,
    gcTime: Infinity,
    meta: { persist: true },
  });
}

/**
 * Returns true while background pages are still arriving for the given project.
 * Subscribing to the query data ensures this hook re-renders on every batch.
 */
export function useIsTestsStreaming(projectKey: string | undefined): boolean {
  useQuery<XrayTest[]>({
    queryKey: queryKeys.tests(projectKey ?? ""),
    enabled: false, // observe only — never trigger a fetch
    staleTime: Infinity,
    gcTime: Infinity,
  });
  if (!projectKey) return false;
  return testStreamMap.get(projectKey) === "streaming";
}

/**
 * Returns a callback that fully resets and re-streams tests for the given project.
 * Using TanStack Query's built-in `refetch()` is NOT safe here because its
 * queryFn result (first page only) would overwrite streamed pages that were
 * appended to the cache while the fetch was in-flight.
 */
export function useReloadTests(projectKey: string | undefined) {
  const queryClient = useQueryClient();

  return useCallback(async () => {
    if (!projectKey) return;
    // Reset stream state so the effect in useGetTests won't block a new stream.
    testStreamMap.set(projectKey, "streaming");
    // Clear existing cache so we start from scratch.
    queryClient.setQueryData<XrayTest[]>(queryKeys.tests(projectKey), []);
    // Ensure the global page listener is wired (may already be).
    await ensureTestsListener(queryClient);
    // Fetch first page — Rust also spawns the background streaming task.
    const firstPage = await api.getTests(projectKey);
    queryClient.setQueryData<XrayTest[]>(queryKeys.tests(projectKey), firstPage);
  }, [projectKey, queryClient]);
}

// ── Get Test Sets ─────────────────────────────────────────────────────────────

/**
 * Fetches test sets for the given project key.
 * Results are persisted to localStorage and only re-fetched on explicit reload.
 */
export function useGetTestSets(projectKey: string | undefined) {
  return useQuery<XrayTestSet[]>({
    queryKey: queryKeys.testSets(projectKey!),
    queryFn: () => api.getTestSets(projectKey!),
    enabled: !!projectKey,
    staleTime: Infinity,
    gcTime: Infinity,
    meta: { persist: true },
  });
}

// ── Get Test Set Tests ────────────────────────────────────────────────────────

export function useGetTestSetTests(issueId: string | null) {
  return useQuery<XrayTest[]>({
    queryKey: queryKeys.testSetTests(issueId ?? ""),
    queryFn: () => api.getTestSetTests(issueId!),
    enabled: !!issueId,
    staleTime: Infinity, // membership only changes via add/remove mutations that invalidate this key
    gcTime: Infinity,
    meta: { persist: true },
  });
}

// ── Get Test Set Tests with latest status (Coverage + Sets Health pages) ─────

export function useGetTestSetTestsWithStatus(issueId: string | null) {
  return useQuery<XrayTestWithStatus[]>({
    queryKey: queryKeys.testSetTestsWithStatus(issueId ?? ""),
    queryFn: () => api.getTestSetTestsWithStatus(issueId!),
    enabled: !!issueId,
    staleTime: Infinity, // only refresh on manual user action
    gcTime: Infinity,
    meta: { persist: true },
  });
}

// ── Batch coverage: fetch multiple sets + consolidated status in one call ────

/**
 * Fetches tests-with-status for multiple test sets in a single backend call.
 * The backend fetches all sets concurrently and does ONE consolidated status
 * lookup across all test IDs — replaces the N+1 pattern of individual
 * `useGetTestSetTestsWithStatus` queries.
 *
 * Returns a Record<setIssueId, XrayTestWithStatus[]>.
 */
export function useCoverageBatch(setIssueIds: string[]) {
  const queryClient = useQueryClient();

  return useQuery<Record<string, XrayTestWithStatus[]>>({
    queryKey: queryKeys.coverageBatch(setIssueIds),
    queryFn: async () => {
      const result = await api.getCoverageBatch(setIssueIds);
      // Populate individual per-set caches so the refetch button and
      // other consumers (e.g. Sets Health) can read from cache.
      for (const [setId, tests] of Object.entries(result)) {
        queryClient.setQueryData(queryKeys.testSetTestsWithStatus(setId), tests);
      }
      return result;
    },
    enabled: setIssueIds.length > 0,
    staleTime: Infinity,
    gcTime: Infinity,
    meta: { persist: true },
  });
}

// ── Get Test Plan Tests ───────────────────────────────────────────────────────

export function useGetTestPlanTests(issueId: string | null) {
  return useQuery<XrayTest[]>({
    queryKey: queryKeys.testPlanTests(issueId ?? ""),
    queryFn: () => api.getTestPlanTests(issueId!),
    enabled: !!issueId,
    staleTime: Infinity, // membership only changes via add/remove mutations that invalidate this key
    gcTime: Infinity,
    meta: { persist: true },
  });
}

// ── Test set membership (for filtering test runs by test set) ─────────────────

export interface TestSetInfo {
  issueId: string;
  key: string;
  summary: string;
}

export function useTestSetMembership(projectKey: string | null) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.testSetMemberships(projectKey!),
    queryFn: () => api.getAllTestSetMemberships(projectKey!),
    enabled: !!projectKey,
    staleTime: Infinity, // membership only changes via add/remove mutations that invalidate this key
    gcTime: Infinity,
    meta: { persist: true },
  });

  // Convert the plain Record from the backend into a Map for the consumers.
  const membership = useMemo(() => {
    const map = new Map<string, TestSetInfo[]>();
    if (!data) return map;

    for (const [testIssueId, sets] of Object.entries(data.memberships)) {
      map.set(
        testIssueId,
        sets.map((s: TestSetMemberInfo) => ({
          issueId: s.issue_id,
          key: s.key,
          summary: s.summary,
        })),
      );
    }
    return map;
  }, [data]);

  // Reverse map: setIssueId → [testIssueId, ...] — derived from batch membership, zero extra calls.
  const setToTests = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!data) return map;
    for (const [setIssueId, testIds] of Object.entries(data.set_to_tests)) {
      map.set(setIssueId, testIds);
    }
    return map;
  }, [data]);

  return {
    testSets: data?.test_sets ?? [],
    membership,
    setToTests,
    isLoading,
  };
}

/** Fetch Xray test detail (testType, steps, gherkin) for a single test by its Jira key. */
export function useTestDetail(testKey: string | null) {
  return useQuery<XrayTestDetail | null>({
    queryKey: queryKeys.testDetail(testKey ?? ""),
    queryFn: () => api.getTestDetail(testKey!),
    enabled: !!testKey,
    staleTime: Infinity,
    gcTime: Infinity,
    meta: { persist: true },
  });
}

/**
 * Fetch the latest test runs for a specific test issue across all executions.
 * Includes full step results, iterations, defects, and parent execution info.
 * Only fetches when testIssueId is non-null (lazy).
 */
export function useTestRunsByTestId(testIssueId: string | null) {
  return useQuery<TestRunsPage>({
    queryKey: queryKeys.testRunsByTestId(testIssueId ?? ""),
    queryFn: () => api.getTestRunsByTestId(testIssueId!),
    enabled: !!testIssueId,
    staleTime: Infinity,
    gcTime: Infinity,
    meta: { persist: true },
  });
}

/**
 * Fetch an Xray evidence file as a base64 data URI (proxied through Tauri).
 * Pass `null` for `downloadUrl` to disable the query.
 */
export function useXrayEvidence(downloadUrl: string | null, mimeType: string) {
  return useQuery<string>({
    queryKey: queryKeys.xrayEvidence(downloadUrl ?? ""),
    queryFn: () => api.fetchXrayEvidence(downloadUrl!, mimeType),
    enabled: !!downloadUrl,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}
