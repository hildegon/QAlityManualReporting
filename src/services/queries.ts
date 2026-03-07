/**
 * TanStack Query hooks for all data-fetching operations.
 * Mutations use optimistic updates for instant UI feedback.
 */
import { useMemo } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type UseMutationResult,
} from "@tanstack/react-query";
import type {
  AppConfig,
  CreateTestExecutionResult,
  CreateTestResult,
  CreateTestSetResult,
  CreateTestStepInput,
  JiraBug,
  JiraComponent,
  JiraProject,
  JiraTransition,
  JiraUser,
  JiraVersion,
  TestExecution,
  TestPlan,
  TestRun,
  TestRunsPage,
  XrayStepStatus,
  XrayTest,
  XrayTestRunStatus,
  XrayTestSet,
} from "@/types";
import * as api from "./tauri";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Number of test runs fetched per page. */
const TEST_RUNS_PAGE_SIZE = 50;

// ── Query keys ────────────────────────────────────────────────────────────────

export const queryKeys = {
  config: ["config"] as const,
  jiraProjects: ["jira", "projects"] as const,
  projectComponents: (projectKey: string) => ["jira", "components", projectKey] as const,
  projectVersions: (projectKey: string) => ["jira", "versions", projectKey] as const,
  issueTransitions: (issueKey: string) => ["jira", "transitions", issueKey] as const,
  userSearch: (query: string) => ["jira", "user-search", query] as const,
  testPlans: (projectKey: string) => ["xray", "test-plans", projectKey] as const,
  testExecutions: (projectKey: string) => ["xray", "test-executions", projectKey] as const,
  testExecutionsByVersion: (projectKey: string, versionName: string) =>
    ["xray", "test-executions-by-version", projectKey, versionName] as const,
  testRuns: (executionIssueId: string) => ["xray", "test-runs", executionIssueId] as const,
  tests: (projectKey: string) => ["xray", "tests", projectKey] as const,
  testSets: (projectKey: string) => ["xray", "test-sets", projectKey] as const,
  testSetTests: (issueId: string) => ["xray", "test-set-tests", issueId] as const,
  testPlanTests: (issueId: string) => ["xray", "test-plan-tests", issueId] as const,
  xrayStatuses: (projectId: string) => ["xray", "statuses", projectId] as const,
  stepStatuses: (projectId: string) => ["xray", "step-statuses", projectId] as const,
  bugsByVersion: (projectKey: string, versionName: string) =>
    ["jira", "bugs-by-version", projectKey, versionName] as const,
};

// ── Config ────────────────────────────────────────────────────────────────────

export function useConfig() {
  return useQuery<AppConfig>({
    queryKey: queryKeys.config,
    queryFn: api.getConfig,
    staleTime: Infinity, // config only changes when the user saves it
  });
}

export function useSaveConfig(): UseMutationResult<void, Error, AppConfig> {
  const queryClient = useQueryClient();
  return useMutation<void, Error, AppConfig>({
    mutationFn: api.saveConfig,
    onSuccess: (_data, variables) => {
      queryClient.setQueryData(queryKeys.config, variables);
    },
  });
}

// ── Jira ──────────────────────────────────────────────────────────────────────

export function useJiraProjects() {
  return useQuery<JiraProject[]>({
    queryKey: queryKeys.jiraProjects,
    queryFn: api.getJiraProjects,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Fetch all components for a Jira project.
 * Only runs when Jira is configured (i.e. the command won't error).
 * Callers should check `isError` and fall back to free-text input if needed.
 */
export function useProjectComponents(projectKey: string | null | undefined) {
  return useQuery<JiraComponent[]>({
    queryKey: queryKeys.projectComponents(projectKey ?? ""),
    queryFn: () => api.getProjectComponents(projectKey!),
    enabled: !!projectKey,
    staleTime: 10 * 60 * 1000, // components rarely change
    retry: false, // don't retry on auth errors (Jira may not be configured)
  });
}

/**
 * Fetch available workflow transitions for a Jira issue.
 * Only runs when `issueKey` is non-null (e.g. when a dialog is open).
 */
export function useIssueTransitions(issueKey: string | null) {
  return useQuery<JiraTransition[]>({
    queryKey: queryKeys.issueTransitions(issueKey ?? ""),
    queryFn: () => api.getIssueTransitions(issueKey!),
    enabled: !!issueKey,
    staleTime: 60 * 1000, // transitions can change, cache briefly
    retry: false,
  });
}

/**
 * Search Jira users by display name or email.
 * Only runs when `query` is at least 2 characters to avoid noisy empty results.
 */
export function useSearchUsers(query: string) {
  return useQuery<JiraUser[]>({
    queryKey: queryKeys.userSearch(query),
    queryFn: () => api.searchUsers(query),
    enabled: query.length >= 2,
    staleTime: 30 * 1000,
    retry: false,
  });
}

// ── Transition Jira issue ─────────────────────────────────────────────────────

interface TransitionIssueVars {
  issueKey: string;
  transitionId: string;
  /** Execution project key — used to invalidate the executions list on success. */
  executionProjectKey: string;
}

/** Apply a workflow transition to a Jira issue and invalidate the executions list. */
export function useTransitionIssue() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, TransitionIssueVars>({
    mutationFn: ({ issueKey, transitionId }) => api.transitionIssue(issueKey, transitionId),
    onSuccess: (_data, { issueKey, executionProjectKey }) => {
      // Invalidate transitions cache so re-opening the dialog shows fresh options
      void queryClient.invalidateQueries({
        queryKey: queryKeys.issueTransitions(issueKey),
      });
      // Refresh the executions list to show the updated status
      void queryClient.invalidateQueries({
        queryKey: queryKeys.testExecutions(executionProjectKey),
      });
    },
  });
}

// ── Update Jira issue assignee ────────────────────────────────────────────────

interface UpdateAssigneeVars {
  issueKey: string;
  accountId?: string;
  /** Execution project key — used to invalidate the executions list on success. */
  executionProjectKey: string;
}

/** Update (or clear) the assignee of a Jira issue and invalidate the executions list. */
export function useUpdateAssignee() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, UpdateAssigneeVars>({
    mutationFn: ({ issueKey, accountId }) => api.updateAssignee(issueKey, accountId),
    onSuccess: (_data, { executionProjectKey }) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.testExecutions(executionProjectKey),
      });
    },
  });
}

// ── Test Plans ────────────────────────────────────────────────────────────────

export function useTestPlans(projectKey: string | null) {
  return useQuery<TestPlan[]>({
    queryKey: queryKeys.testPlans(projectKey ?? ""),
    queryFn: () => api.getTestPlans(projectKey!),
    enabled: !!projectKey,
    staleTime: 2 * 60 * 1000,
  });
}

// ── Test Executions ───────────────────────────────────────────────────────────

export function useTestExecutions(projectKey: string | null) {
  return useQuery<TestExecution[]>({
    queryKey: queryKeys.testExecutions(projectKey ?? ""),
    queryFn: () => api.getTestExecutions(projectKey!),
    enabled: !!projectKey,
    staleTime: 5 * 60 * 1_000, // 5 minutes
  });
}

// ── Jira Versions ─────────────────────────────────────────────────────────────

/** Fetch all versions for a Jira project. */
export function useProjectVersions(projectKey: string | null) {
  return useQuery<JiraVersion[]>({
    queryKey: queryKeys.projectVersions(projectKey ?? ""),
    queryFn: () => api.getProjectVersions(projectKey!),
    enabled: !!projectKey,
    staleTime: 5 * 60 * 1_000,
  });
}

// ── Bugs by Version ───────────────────────────────────────────────────────────

/** Fetch Bug issues with the given affectedVersion in a Jira project. */
export function useBugsByVersion(projectKey: string | null, versionName: string | null) {
  return useQuery<JiraBug[]>({
    queryKey: queryKeys.bugsByVersion(projectKey ?? "", versionName ?? ""),
    queryFn: () => api.getBugsByVersion(projectKey!, versionName!),
    enabled: !!projectKey && !!versionName,
    staleTime: 2 * 60 * 1_000,
  });
}

// ── Test Executions by Version ────────────────────────────────────────────────

/** Fetch test executions in a project filtered by a specific fix version. */
export function useTestExecutionsByVersion(projectKey: string | null, versionName: string | null) {
  return useQuery<TestExecution[]>({
    queryKey: queryKeys.testExecutionsByVersion(projectKey ?? "", versionName ?? ""),
    queryFn: () => api.getTestExecutionsByVersion(projectKey!, versionName!),
    enabled: !!projectKey && !!versionName,
    staleTime: 2 * 60 * 1_000,
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
    queryFn: ({ pageParam }) => api.getTestRuns(executionIssueId!, TEST_RUNS_PAGE_SIZE, pageParam),
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
    staleTime: 30 * 1000,
  });
}

// ── Xray statuses ─────────────────────────────────────────────────────────────

export function useXrayStatuses(projectId: string | null) {
  return useQuery<XrayTestRunStatus[]>({
    queryKey: queryKeys.xrayStatuses(projectId ?? ""),
    queryFn: () => api.getXrayStatuses(projectId!),
    enabled: !!projectId,
    staleTime: 10 * 60 * 1000, // statuses rarely change
  });
}

// ── Step statuses ─────────────────────────────────────────────────────────────

export function useStepStatuses(projectId: string | null) {
  return useQuery<XrayStepStatus[]>({
    queryKey: queryKeys.stepStatuses(projectId ?? ""),
    queryFn: () => api.getStepStatuses(projectId!),
    enabled: !!projectId,
    staleTime: 10 * 60 * 1000,
  });
}

// ── Infinite data helpers ─────────────────────────────────────────────────────

type TestRunsInfiniteData = InfiniteData<TestRunsPage>;

/** Map over every test run across all pages in an InfiniteData structure. */
function mapRunsAcrossPages(
  old: TestRunsInfiniteData | undefined,
  mapper: (run: TestRun) => TestRun,
): TestRunsInfiniteData | undefined {
  if (!old) return undefined;
  return {
    ...old,
    pages: old.pages.map((page) => ({
      ...page,
      results: page.results.map(mapper),
    })),
  };
}

// ── Update test run status (optimistic) ──────────────────────────────────────

interface UpdateStatusVars {
  testRunId: string;
  status: string;
  executionIssueId: string;
}

export function useUpdateTestRunStatus() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, UpdateStatusVars>({
    mutationFn: ({ testRunId, status }) => api.updateTestRunStatus(testRunId, status),

    // Optimistic update: flip status in the cache immediately
    onMutate: async ({ testRunId, status, executionIssueId }) => {
      const key = queryKeys.testRuns(executionIssueId);
      await queryClient.cancelQueries({ queryKey: key });

      const previous = queryClient.getQueryData<TestRunsInfiniteData>(key);
      queryClient.setQueryData<TestRunsInfiniteData>(key, (old) =>
        mapRunsAcrossPages(old, (run) =>
          run.id === testRunId ? { ...run, status: { ...run.status, name: status } } : run,
        ),
      );
      return { previous };
    },

    // Roll back on failure
    onError: (_err, { executionIssueId }, context) => {
      const ctx = context as { previous?: TestRunsInfiniteData } | undefined;
      if (ctx?.previous) {
        queryClient.setQueryData(queryKeys.testRuns(executionIssueId), ctx.previous);
      }
    },

    // Always refetch to confirm server state
    onSettled: (_data, _err, { executionIssueId }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.testRuns(executionIssueId) });
    },
  });
}

// ── Update test run comment ───────────────────────────────────────────────────

interface UpdateCommentVars {
  testRunId: string;
  comment: string;
  executionIssueId: string;
}

export function useUpdateTestRunComment() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, UpdateCommentVars>({
    mutationFn: ({ testRunId, comment }) => api.updateTestRunComment(testRunId, comment),

    // Optimistic: update comment in cache immediately
    onMutate: async ({ testRunId, comment, executionIssueId }) => {
      const key = queryKeys.testRuns(executionIssueId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<TestRunsInfiniteData>(key);
      queryClient.setQueryData<TestRunsInfiniteData>(key, (old) =>
        mapRunsAcrossPages(old, (run) => (run.id === testRunId ? { ...run, comment } : run)),
      );
      return { previous };
    },

    onError: (_err, { executionIssueId }, context) => {
      const ctx = context as { previous?: TestRunsInfiniteData } | undefined;
      if (ctx?.previous) {
        queryClient.setQueryData(queryKeys.testRuns(executionIssueId), ctx.previous);
      }
    },

    onSettled: (_data, _err, { executionIssueId }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.testRuns(executionIssueId) });
    },
  });
}

// ── Update test run step status (optimistic) ────────────────────────────────

interface UpdateStepStatusVars {
  testRunId: string;
  stepId: string;
  status: string;
  executionIssueId: string;
}

export function useUpdateTestRunStepStatus() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, UpdateStepStatusVars>({
    mutationFn: ({ testRunId, stepId, status }) =>
      api.updateTestRunStepStatus(testRunId, stepId, status),

    // Optimistic update: flip step status in the cache immediately
    onMutate: async ({ testRunId, stepId, status, executionIssueId }) => {
      const key = queryKeys.testRuns(executionIssueId);
      await queryClient.cancelQueries({ queryKey: key });

      const previous = queryClient.getQueryData<TestRunsInfiniteData>(key);
      queryClient.setQueryData<TestRunsInfiniteData>(key, (old) =>
        mapRunsAcrossPages(old, (run) =>
          run.id === testRunId
            ? {
                ...run,
                ...(run.steps
                  ? {
                      steps: run.steps.map((step) =>
                        step.id === stepId
                          ? { ...step, status: { ...step.status, name: status } }
                          : step,
                      ),
                    }
                  : {}),
              }
            : run,
        ),
      );
      return { previous };
    },

    onError: (_err, { executionIssueId }, context) => {
      const ctx = context as { previous?: TestRunsInfiniteData } | undefined;
      if (ctx?.previous) {
        queryClient.setQueryData(queryKeys.testRuns(executionIssueId), ctx.previous);
      }
    },

    onSettled: (_data, _err, { executionIssueId }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.testRuns(executionIssueId) });
    },
  });
}

// ── Update test run step (full: comment + actualResult + status) ─────────────

interface UpdateStepVars {
  testRunId: string;
  stepId: string;
  comment?: string;
  actualResult?: string;
  status?: string;
  executionIssueId: string;
}

export function useUpdateTestRunStep() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, UpdateStepVars>({
    mutationFn: ({ testRunId, stepId, comment, actualResult, status }) =>
      api.updateTestRunStep(testRunId, stepId, comment, actualResult, status),

    // Optimistic update: apply changes in cache immediately
    onMutate: async ({ testRunId, stepId, comment, actualResult, status, executionIssueId }) => {
      const key = queryKeys.testRuns(executionIssueId);
      await queryClient.cancelQueries({ queryKey: key });

      const previous = queryClient.getQueryData<TestRunsInfiniteData>(key);
      queryClient.setQueryData<TestRunsInfiniteData>(key, (old) =>
        mapRunsAcrossPages(old, (run) =>
          run.id === testRunId
            ? {
                ...run,
                ...(run.steps
                  ? {
                      steps: run.steps.map((step) =>
                        step.id === stepId
                          ? {
                              ...step,
                              ...(comment !== undefined ? { comment } : {}),
                              ...(actualResult !== undefined
                                ? { actual_result: actualResult }
                                : {}),
                              ...(status !== undefined
                                ? { status: { ...step.status, name: status } }
                                : {}),
                            }
                          : step,
                      ),
                    }
                  : {}),
              }
            : run,
        ),
      );
      return { previous };
    },

    onError: (_err, { executionIssueId }, context) => {
      const ctx = context as { previous?: TestRunsInfiniteData } | undefined;
      if (ctx?.previous) {
        queryClient.setQueryData(queryKeys.testRuns(executionIssueId), ctx.previous);
      }
    },

    onSettled: (_data, _err, { executionIssueId }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.testRuns(executionIssueId) });
    },
  });
}

// ── Create test execution ─────────────────────────────────────────────────────

interface CreateExecutionVars {
  projectKey: string;
  summary: string;
  testPlanId?: string | undefined;
  testIssueIds?: string[] | undefined;
  description?: string | undefined;
}

export function useCreateTestExecution() {
  const queryClient = useQueryClient();
  return useMutation<CreateTestExecutionResult, Error, CreateExecutionVars>({
    mutationFn: ({ projectKey, summary, testPlanId, testIssueIds, description }) =>
      api.createTestExecution(projectKey, summary, testPlanId, testIssueIds, description),
    onSuccess: (_data, { projectKey }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.testExecutions(projectKey) });
    },
  });
}

// ── Get Tests ─────────────────────────────────────────────────────────────────

export function useGetTests(projectKey: string | undefined) {
  return useQuery<XrayTest[]>({
    queryKey: queryKeys.tests(projectKey ?? ""),
    queryFn: () => api.getTests(projectKey!),
    enabled: !!projectKey,
    staleTime: 5 * 60 * 1_000,
  });
}

// ── Get Test Sets ─────────────────────────────────────────────────────────────

export function useGetTestSets(projectKey: string | undefined) {
  return useQuery<XrayTestSet[]>({
    queryKey: queryKeys.testSets(projectKey ?? ""),
    queryFn: () => api.getTestSets(projectKey!),
    enabled: !!projectKey,
    staleTime: 5 * 60 * 1_000,
  });
}

// ── Get Test Set Tests ────────────────────────────────────────────────────────

export function useGetTestSetTests(issueId: string | null) {
  return useQuery<XrayTest[]>({
    queryKey: queryKeys.testSetTests(issueId ?? ""),
    queryFn: () => api.getTestSetTests(issueId!),
    enabled: !!issueId,
    staleTime: 5 * 60 * 1_000,
  });
}

// ── Get Test Plan Tests ───────────────────────────────────────────────────────

export function useGetTestPlanTests(issueId: string | null) {
  return useQuery<XrayTest[]>({
    queryKey: queryKeys.testPlanTests(issueId ?? ""),
    queryFn: () => api.getTestPlanTests(issueId!),
    enabled: !!issueId,
    staleTime: 5 * 60 * 1_000,
  });
}

// ── Create Test Set ───────────────────────────────────────────────────────────

export function useCreateTestSet() {
  const queryClient = useQueryClient();
  return useMutation<CreateTestSetResult, Error, { projectKey: string; summary: string }>({
    mutationFn: ({ projectKey, summary }) => api.createTestSet(projectKey, summary),
    onSuccess: (_data, { projectKey }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.testSets(projectKey) });
    },
  });
}

// ── Add Tests to Test Set ─────────────────────────────────────────────────────

export function useAddTestsToTestSet() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { testSetIssueId: string; testIssueIds: string[] }>({
    mutationFn: ({ testSetIssueId, testIssueIds }) =>
      api.addTestsToTestSet(testSetIssueId, testIssueIds),
    onSuccess: (_data, { testSetIssueId }) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.testSetTests(testSetIssueId),
      });
    },
  });
}

// ── Create Test ───────────────────────────────────────────────────────────────

interface CreateTestVars {
  projectKey: string;
  summary: string;
  steps: CreateTestStepInput[];
  component?: string | undefined;
}

export function useCreateTest() {
  const queryClient = useQueryClient();
  return useMutation<CreateTestResult, Error, CreateTestVars>({
    mutationFn: ({ projectKey, summary, steps, component }) =>
      api.createTest(projectKey, summary, steps, component),
    onSuccess: (_data, { projectKey }) => {
      // Invalidate the tests list so the new test appears if the Tests page is visited.
      void queryClient.invalidateQueries({ queryKey: queryKeys.tests(projectKey) });
    },
  });
}

// ── Test set membership (for filtering test runs by test set) ─────────────────

export interface TestSetInfo {
  issueId: string;
  key: string;
  summary: string;
}

// ── Version run statistics ────────────────────────────────────────────────────

/**
 * A single test's result history across all executions in the version.
 * Entries are ordered by execution Jira key (ascending, i.e. earliest first).
 */
export interface TestRunHistory {
  /** Stable Xray test issue ID — the same test across all executions. */
  testIssueId: string;
  testKey: string;
  testSummary: string;
  /**
   * One entry per execution in which this test appeared, sorted by execution
   * key ascending (proxy for chronological order since no date is available).
   */
  history: Array<{
    executionKey: string;
    executionIssueId: string;
    statusName: string;
  }>;
  /**
   * Classification derived from the history:
   *  - "fixed"      — ever failed/blocked, but the *last* result is a pass
   *  - "failing"    — last result is a failure or blocked status
   *  - "flaky"      — multiple executions with mixed pass/fail results
   *  - "never-passed" — only one execution and it failed (no trend yet)
   */
  classification: "fixed" | "failing" | "flaky" | "never-passed";
}

export interface RunStats {
  /** Counts keyed by uppercased status name, e.g. { PASS: 12, FAIL: 3, TODO: 5 } */
  counts: Record<string, number>;
  /** Total number of test runs across all executions (sum of results loaded). */
  total: number;
  /** How many individual page fetches have completed (for progress indication). */
  pagesLoaded: number;
  /** How many individual page fetches are expected in total. */
  pagesExpected: number;
  /**
   * Per-test history for every test that had at least one non-passing result
   * (FAIL, BLOCKED, or any non-PASS/TODO/EXECUTING status).
   * Only populated once all pages have loaded.
   */
  failedTests: TestRunHistory[];
}

const PASS_STATUSES = new Set(["PASS", "PASSED"]);
const FAIL_STATUSES = new Set(["FAIL", "FAILED", "BLOCKED"]);

function classifyHistory(history: TestRunHistory["history"]): TestRunHistory["classification"] {
  if (history.length === 0) return "failing";
  const last = history[history.length - 1]!;
  const lastStatus = last.statusName.toUpperCase();
  const isLastPass = PASS_STATUSES.has(lastStatus);
  const hadFailure = history.some((h) => FAIL_STATUSES.has(h.statusName.toUpperCase()));

  if (isLastPass && hadFailure) return "fixed";
  if (!isLastPass && hadFailure) {
    // Flaky: had at least one pass before the last failure
    const hadPass = history.slice(0, -1).some((h) => PASS_STATUSES.has(h.statusName.toUpperCase()));
    return hadPass ? "flaky" : history.length > 1 ? "failing" : "never-passed";
  }
  return "failing";
}

/**
 * Aggregates test-run status counts AND per-test failure history across all
 * executions in a version.
 *
 * Cache-key safety: phase 1 uses the prefix "version-run-stats" to avoid
 * colliding with the `useInfiniteQuery` cache entries written by `useTestRuns`
 * (which uses `queryKeys.testRuns`). Both hooks call the same Rust command but
 * write incompatible data shapes — regular `TestRunsPage` vs `InfiniteData`.
 *
 * Strategy (two-phase parallel fetch):
 *   Phase 1 — fetch page 0 for every execution simultaneously. Each page 0
 *              response carries `total`, letting us compute extra pages needed.
 *   Phase 2 — fire all remaining pages in parallel.
 *   Aggregate — counts and per-test histories are built from every resolved page.
 */
export function useVersionRunStats(executions: TestExecution[]): RunStats {
  const PAGE_SIZE = TEST_RUNS_PAGE_SIZE;

  // ── Phase 1: page 0 per execution ────────────────────────────────────────────
  // NOTE: key prefix "version-run-stats" avoids colliding with the InfiniteQuery
  // cache entries that useTestRuns writes under ["xray", "test-runs", issueId].
  const phase1 = useQueries({
    queries: executions.map((ex) => ({
      queryKey: ["version-run-stats", ex.issue_id, 0] as const,
      queryFn: () => api.getTestRuns(ex.issue_id, PAGE_SIZE, 0),
      staleTime: 30 * 1_000,
      enabled: executions.length > 0,
    })),
  });

  // ── Phase 2: extra pages derived from phase 1 totals ─────────────────────────
  const extraPageQueries = useMemo(() => {
    const queries: { issueId: string; start: number }[] = [];
    for (let i = 0; i < executions.length; i++) {
      const ex = executions[i];
      const page0 = phase1[i]?.data;
      if (!page0 || !ex) continue;
      for (let start = PAGE_SIZE; start < page0.total; start += PAGE_SIZE) {
        queries.push({ issueId: ex.issue_id, start });
      }
    }
    return queries;
  }, [executions, phase1, PAGE_SIZE]);

  const phase2 = useQueries({
    queries: extraPageQueries.map(({ issueId, start }) => ({
      queryKey: ["version-run-stats", issueId, start] as const,
      queryFn: () => api.getTestRuns(issueId, PAGE_SIZE, start),
      staleTime: 30 * 1_000,
      enabled: extraPageQueries.length > 0,
    })),
  });

  // ── Aggregate ────────────────────────────────────────────────────────────────
  return useMemo(() => {
    const counts: Record<string, number> = {};
    let total = 0;
    let pagesLoaded = 0;
    const pagesExpected = executions.length + extraPageQueries.length;

    // Map from testIssueId → { meta, history entries indexed by executionIssueId }
    const testMap = new Map<
      string,
      { testKey: string; testSummary: string; byExec: Map<string, string> }
    >();

    const processPage = (page: TestRunsPage | undefined, executionIssueId: string) => {
      if (!page) return;
      pagesLoaded += 1;
      for (const run of page.results) {
        const statusKey = run.status.name.toUpperCase();
        counts[statusKey] = (counts[statusKey] ?? 0) + 1;
        total += 1;

        // Track every run that ever failed/blocked for cross-execution history
        const statusUpper = statusKey;
        if (FAIL_STATUSES.has(statusUpper) || PASS_STATUSES.has(statusUpper)) {
          const tid = run.test.issue_id;
          if (!testMap.has(tid)) {
            testMap.set(tid, {
              testKey: run.test.jira.key,
              testSummary: run.test.jira.summary,
              byExec: new Map(),
            });
          }
          // Last write wins if multiple runs for the same test in the same execution
          testMap.get(tid)!.byExec.set(executionIssueId, run.status.name);
        }
      }
    };

    for (let i = 0; i < executions.length; i++) {
      processPage(phase1[i]?.data, executions[i]?.issue_id ?? "");
    }
    for (let i = 0; i < extraPageQueries.length; i++) {
      processPage(phase2[i]?.data, extraPageQueries[i]?.issueId ?? "");
    }

    // Build TestRunHistory only for tests that had at least one failure/block
    const allLoaded = pagesLoaded >= pagesExpected && pagesExpected > 0;
    const failedTests: TestRunHistory[] = [];

    if (allLoaded) {
      // Sort executions by Jira key for consistent chronological ordering
      const sortedExecs = [...executions].sort((a, b) =>
        a.jira.key.localeCompare(b.jira.key, undefined, { numeric: true }),
      );

      for (const [testIssueId, meta] of testMap) {
        // Only include tests that had at least one failure or block
        const hadFailure = [...meta.byExec.values()].some((s) =>
          FAIL_STATUSES.has(s.toUpperCase()),
        );
        if (!hadFailure) continue;

        const history: TestRunHistory["history"] = sortedExecs
          .filter((ex) => meta.byExec.has(ex.issue_id))
          .map((ex) => ({
            executionKey: ex.jira.key,
            executionIssueId: ex.issue_id,
            statusName: meta.byExec.get(ex.issue_id)!,
          }));

        failedTests.push({
          testIssueId,
          testKey: meta.testKey,
          testSummary: meta.testSummary,
          history,
          classification: classifyHistory(history),
        });
      }

      // Sort: still failing first, then flaky, then fixed, then never-passed
      const ORDER: Record<TestRunHistory["classification"], number> = {
        failing: 0,
        flaky: 1,
        "never-passed": 2,
        fixed: 3,
      };
      failedTests.sort((a, b) => ORDER[a.classification] - ORDER[b.classification]);
    }

    return { counts, total, pagesLoaded, pagesExpected, failedTests };
  }, [executions, extraPageQueries, phase1, phase2]);
}

/**
 * Fetches all test sets for a project and the tests belonging to each set.
 * Returns:
 *   - `testSets` — list of test sets (for rendering filter options)
 *   - `membership` — Map<testIssueId, TestSetInfo[]> for looking up which sets a test belongs to
 *   - `isLoading` — true while the initial test-sets list is loading
 */
export function useTestSetMembership(projectKey: string | null) {
  // Step 1: fetch test sets list (re-uses the cached result from the Test Sets page).
  const { data: testSets, isLoading: setsLoading } = useGetTestSets(projectKey ?? undefined);

  // Step 2: for each test set, fetch its member test issue IDs in parallel.
  const setTestsResults = useQueries({
    queries: (testSets ?? []).map((ts) => ({
      queryKey: queryKeys.testSetTests(ts.issue_id),
      queryFn: () => api.getTestSetTests(ts.issue_id),
      staleTime: 5 * 60 * 1_000,
      enabled: !!projectKey && (testSets?.length ?? 0) > 0,
    })),
  });

  // Step 3: build the lookup map once all (or some) results are available.
  const membership = useMemo(() => {
    const map = new Map<string, TestSetInfo[]>();
    (testSets ?? []).forEach((ts, idx) => {
      const result = setTestsResults[idx];
      const tests = result?.data ?? [];
      for (const t of tests) {
        const existing = map.get(t.issue_id) ?? [];
        existing.push({ issueId: ts.issue_id, key: ts.jira.key, summary: ts.jira.summary });
        map.set(t.issue_id, existing);
      }
    });
    return map;
  }, [testSets, setTestsResults]);

  return {
    testSets: testSets ?? [],
    membership,
    isLoading: setsLoading,
  };
}
