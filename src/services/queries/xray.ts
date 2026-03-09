/**
 * TanStack Query hooks for Xray Cloud GraphQL operations.
 */
import {
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { useMemo } from "react";
import type {
  CreateTestExecutionResult,
  CreateTestPlanResult,
  CreateTestResult,
  CreateTestSetResult,
  CreateTestStepInput,
  JiraBug,
  TestExecution,
  TestPlan,
  TestRun,
  TestRunsPage,
  TestSetMemberInfo,
  XrayStepStatus,
  XrayTest,
  XrayTestRunStatus,
  XrayTestSet,
  XrayTestWithStatus,
} from "@/types";
import * as api from "@/services/tauri";
import { queryKeys } from "./keys";

// ── Constants ─────────────────────────────────────────────────────────────────

const TEST_RUNS_PAGE_SIZE = 50;

// ── Read hooks ────────────────────────────────────────────────────────────────

export function useTestPlans(projectKey: string | null) {
  return useQuery<TestPlan[]>({
    queryKey: queryKeys.testPlans(projectKey ?? ""),
    queryFn: () => api.getTestPlans(projectKey!),
    enabled: !!projectKey,
    staleTime: 2 * 60 * 1000,
  });
}

export function useTestExecutions(projectKey: string | null) {
  return useQuery<TestExecution[]>({
    queryKey: queryKeys.testExecutions(projectKey ?? ""),
    queryFn: () => api.getTestExecutions(projectKey!),
    enabled: !!projectKey,
    staleTime: 5 * 60 * 1_000,
  });
}

export function useTestExecutionsByVersion(projectKey: string | null, versionName: string | null) {
  return useQuery<TestExecution[]>({
    queryKey: queryKeys.testExecutionsByVersion(projectKey ?? "", versionName ?? ""),
    queryFn: () => api.getTestExecutionsByVersion(projectKey!, versionName!),
    enabled: !!projectKey && !!versionName,
    staleTime: 2 * 60 * 1_000,
  });
}

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
      const nextStart = start + lastPage.results.length;
      return nextStart >= lastPage.total ? undefined : nextStart;
    },
    enabled: !!executionIssueId,
    staleTime: 2 * 60 * 1_000,
  });
}

export function useXrayStatuses(projectId: string | null) {
  return useQuery<XrayTestRunStatus[]>({
    queryKey: queryKeys.xrayStatuses(projectId ?? ""),
    queryFn: () => api.getXrayStatuses(projectId!),
    enabled: !!projectId,
    staleTime: 10 * 60 * 1000,
  });
}

export function useStepStatuses(projectId: string | null) {
  return useQuery<XrayStepStatus[]>({
    queryKey: queryKeys.stepStatuses(projectId ?? ""),
    queryFn: () => api.getStepStatuses(projectId!),
    enabled: !!projectId,
    staleTime: 10 * 60 * 1000,
  });
}

export function useGetTests(projectKey: string | undefined) {
  return useQuery<XrayTest[]>({
    queryKey: queryKeys.tests(projectKey ?? ""),
    queryFn: () => api.getTests(projectKey!),
    enabled: !!projectKey,
    staleTime: 5 * 60 * 1_000,
  });
}

export function useGetTestSets(projectKey: string | undefined) {
  return useQuery<XrayTestSet[]>({
    queryKey: queryKeys.testSets(projectKey ?? ""),
    queryFn: () => api.getTestSets(projectKey!),
    enabled: !!projectKey,
    staleTime: 5 * 60 * 1_000,
  });
}

export function useGetTestSetTests(issueId: string | null) {
  return useQuery<XrayTest[]>({
    queryKey: queryKeys.testSetTests(issueId ?? ""),
    queryFn: () => api.getTestSetTests(issueId!),
    enabled: !!issueId,
    staleTime: 5 * 60 * 1_000,
  });
}

export function useGetTestSetTestsWithStatus(issueId: string | null) {
  return useQuery<XrayTestWithStatus[]>({
    queryKey: queryKeys.testSetTestsWithStatus(issueId ?? ""),
    queryFn: () => api.getTestSetTestsWithStatus(issueId!),
    enabled: !!issueId,
    staleTime: 2 * 60 * 1_000,
  });
}

export function useGetTestPlanTests(issueId: string | null) {
  return useQuery<XrayTest[]>({
    queryKey: queryKeys.testPlanTests(issueId ?? ""),
    queryFn: () => api.getTestPlanTests(issueId!),
    enabled: !!issueId,
    staleTime: 5 * 60 * 1_000,
  });
}

// ── Membership ────────────────────────────────────────────────────────────────

export interface TestSetInfo {
  issueId: string;
  key: string;
  summary: string;
}

export function useTestSetMembership(projectKey: string | null) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.testSetMemberships(projectKey ?? ""),
    queryFn: () => api.getAllTestSetMemberships(projectKey!),
    enabled: !!projectKey,
    staleTime: 5 * 60 * 1_000,
  });

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

  return { testSets: data?.test_sets ?? [], membership, isLoading };
}

// ── Mutations ─────────────────────────────────────────────────────────────────

// Shared: map over every run across all pages
type TestRunsInfiniteData = InfiniteData<TestRunsPage>;

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

// Debounced query invalidation (prevents thundering herd during bulk ops)
const DEBOUNCE_MS = 500;
const pendingInvalidations = new Map<string, ReturnType<typeof setTimeout>>();

function debouncedInvalidateTestRuns(
  queryClient: ReturnType<typeof useQueryClient>,
  executionIssueId: string,
) {
  const existing = pendingInvalidations.get(executionIssueId);
  if (existing) clearTimeout(existing);
  pendingInvalidations.set(
    executionIssueId,
    setTimeout(() => {
      pendingInvalidations.delete(executionIssueId);
      void queryClient.invalidateQueries({ queryKey: queryKeys.testRuns(executionIssueId) });
    }, DEBOUNCE_MS),
  );
}

// ── Test run optimistic mutations ─────────────────────────────────────────────

interface UpdateStatusVars {
  testRunId: string;
  status: string;
  executionIssueId: string;
}

export function useUpdateTestRunStatus() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, UpdateStatusVars>({
    mutationFn: ({ testRunId, status }) => api.updateTestRunStatus(testRunId, status),
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
    onError: (_err, { executionIssueId }, context) => {
      const ctx = context as { previous?: TestRunsInfiniteData } | undefined;
      if (ctx?.previous)
        queryClient.setQueryData(queryKeys.testRuns(executionIssueId), ctx.previous);
    },
    onSettled: (_data, _err, { executionIssueId }) => {
      debouncedInvalidateTestRuns(queryClient, executionIssueId);
    },
  });
}

interface UpdateCommentVars {
  testRunId: string;
  comment: string;
  executionIssueId: string;
}

export function useUpdateTestRunComment() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, UpdateCommentVars>({
    mutationFn: ({ testRunId, comment }) => api.updateTestRunComment(testRunId, comment),
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
      if (ctx?.previous)
        queryClient.setQueryData(queryKeys.testRuns(executionIssueId), ctx.previous);
    },
    onSettled: (_data, _err, { executionIssueId }) => {
      debouncedInvalidateTestRuns(queryClient, executionIssueId);
    },
  });
}

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
      if (ctx?.previous)
        queryClient.setQueryData(queryKeys.testRuns(executionIssueId), ctx.previous);
    },
    onSettled: (_data, _err, { executionIssueId }) => {
      debouncedInvalidateTestRuns(queryClient, executionIssueId);
    },
  });
}

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
      if (ctx?.previous)
        queryClient.setQueryData(queryKeys.testRuns(executionIssueId), ctx.previous);
    },
    onSettled: (_data, _err, { executionIssueId }) => {
      debouncedInvalidateTestRuns(queryClient, executionIssueId);
    },
  });
}

// ── Create/write mutations ────────────────────────────────────────────────────

interface CreateExecutionVars {
  projectKey: string;
  summary: string;
  testPlanId?: string;
  testIssueIds?: string[];
  description?: string;
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

export function useCreateTestSet() {
  const queryClient = useQueryClient();
  return useMutation<
    CreateTestSetResult,
    Error,
    { projectKey: string; summary: string; component?: string }
  >({
    mutationFn: ({ projectKey, summary, component }) =>
      api.createTestSet(projectKey, summary, component),
    onSuccess: (_data, { projectKey }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.testSets(projectKey) });
    },
  });
}

export function useAddTestsToTestSet() {
  const queryClient = useQueryClient();
  return useMutation<
    void,
    Error,
    { testSetIssueId: string; testIssueIds: string[]; projectKey: string }
  >({
    mutationFn: ({ testSetIssueId, testIssueIds }) =>
      api.addTestsToTestSet(testSetIssueId, testIssueIds),
    onSuccess: (_data, { testSetIssueId, projectKey }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.testSetTests(testSetIssueId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.testSetMemberships(projectKey) });
    },
  });
}

export function useRemoveTestsFromTestSet() {
  const queryClient = useQueryClient();
  return useMutation<
    void,
    Error,
    { testSetIssueId: string; testIssueIds: string[]; projectKey: string }
  >({
    mutationFn: ({ testSetIssueId, testIssueIds }) =>
      api.removeTestsFromTestSet(testSetIssueId, testIssueIds),
    onSuccess: (_data, { testSetIssueId, projectKey }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.testSetTests(testSetIssueId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.testSetMemberships(projectKey) });
    },
  });
}

export function useCreateTestPlan() {
  const queryClient = useQueryClient();
  return useMutation<
    CreateTestPlanResult,
    Error,
    {
      projectKey: string;
      summary: string;
      description?: string;
      component?: string;
      fixVersion?: string;
    }
  >({
    mutationFn: ({ projectKey, summary, description, component, fixVersion }) =>
      api.createTestPlan(projectKey, summary, description, component, fixVersion),
    onSuccess: (_data, { projectKey }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.testPlans(projectKey) });
    },
  });
}

export function useAddTestsToTestPlan() {
  const queryClient = useQueryClient();
  return useMutation<
    void,
    Error,
    { testPlanIssueId: string; testIssueIds: string[]; projectKey: string }
  >({
    mutationFn: ({ testPlanIssueId, testIssueIds }) =>
      api.addTestsToTestPlan(testPlanIssueId, testIssueIds),
    onSuccess: (_data, { testPlanIssueId, projectKey }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.testPlanTests(testPlanIssueId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.testPlans(projectKey) });
    },
  });
}

export function useAddTestsToTestExecution() {
  const queryClient = useQueryClient();
  return useMutation<
    void,
    Error,
    { testExecIssueId: string; testIssueIds: string[]; executionProjectKey: string }
  >({
    mutationFn: ({ testExecIssueId, testIssueIds }) =>
      api.addTestsToTestExecution(testExecIssueId, testIssueIds),
    onSuccess: (_data, { testExecIssueId, executionProjectKey }) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.testRuns(testExecIssueId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.testExecutions(executionProjectKey),
      });
    },
  });
}

export function useRemoveTestsFromTestPlan() {
  const queryClient = useQueryClient();
  return useMutation<
    void,
    Error,
    { testPlanIssueId: string; testIssueIds: string[]; projectKey: string }
  >({
    mutationFn: ({ testPlanIssueId, testIssueIds }) =>
      api.removeTestsFromTestPlan(testPlanIssueId, testIssueIds),
    onSuccess: (_data, { testPlanIssueId, projectKey }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.testPlanTests(testPlanIssueId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.testPlans(projectKey) });
    },
  });
}

interface CreateTestVars {
  projectKey: string;
  summary: string;
  steps: CreateTestStepInput[];
  component?: string;
}

export function useCreateTest() {
  const queryClient = useQueryClient();
  return useMutation<CreateTestResult, Error, CreateTestVars>({
    mutationFn: ({ projectKey, summary, steps, component }) =>
      api.createTest(projectKey, summary, steps, component),
    onSuccess: (_data, { projectKey }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tests(projectKey) });
    },
  });
}

// ── Version run statistics ────────────────────────────────────────────────────

export interface TestRunHistory {
  testIssueId: string;
  testKey: string;
  testSummary: string;
  history: Array<{
    executionKey: string;
    executionIssueId: string;
    statusName: string;
  }>;
  classification: "fixed" | "failing" | "flaky" | "never-passed";
  /**
   * Keys of bugs in Jira that are linked to this test (via Jira issue links).
   * Only populated when bugs data is passed to useVersionRunStats.
   */
  linkedBugKeys: string[];
}

export interface RunStats {
  counts: Record<string, number>;
  total: number;
  pagesLoaded: number;
  pagesExpected: number;
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
    const hadPass = history.slice(0, -1).some((h) => PASS_STATUSES.has(h.statusName.toUpperCase()));
    return hadPass ? "flaky" : history.length > 1 ? "failing" : "never-passed";
  }
  return "failing";
}

export function useVersionRunStats(executions: TestExecution[], bugs?: JiraBug[]): RunStats {
  const PAGE_SIZE = TEST_RUNS_PAGE_SIZE;

  const phase1 = useQueries({
    queries: executions.map((ex) => ({
      queryKey: ["version-run-stats", ex.issue_id, 0] as const,
      queryFn: () => api.getTestRuns(ex.issue_id, PAGE_SIZE, 0),
      staleTime: 5 * 60 * 1_000,
      enabled: executions.length > 0,
    })),
  });

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
      staleTime: 5 * 60 * 1_000,
      enabled: extraPageQueries.length > 0,
    })),
  });

  return useMemo(() => {
    let pagesLoaded = 0;
    const pagesExpected = executions.length + extraPageQueries.length;

    const testMap = new Map<
      string,
      { testKey: string; testSummary: string; byExec: Map<string, string> }
    >();

    const processPage = (page: TestRunsPage | undefined, executionIssueId: string) => {
      if (!page) return;
      pagesLoaded += 1;
      for (const run of page.results) {
        const tid = run.test.issue_id;
        if (!testMap.has(tid)) {
          testMap.set(tid, {
            testKey: run.test.jira.key,
            testSummary: run.test.jira.summary,
            byExec: new Map(),
          });
        }
        testMap.get(tid)!.byExec.set(executionIssueId, run.status.name);
      }
    };

    for (let i = 0; i < executions.length; i++) {
      processPage(phase1[i]?.data, executions[i]?.issue_id ?? "");
    }
    for (let i = 0; i < extraPageQueries.length; i++) {
      processPage(phase2[i]?.data, extraPageQueries[i]?.issueId ?? "");
    }

    const sortedExecs = [...executions].sort((a, b) =>
      a.jira.key.localeCompare(b.jira.key, undefined, { numeric: true }),
    );

    const counts: Record<string, number> = {};
    let total = 0;
    for (const [, meta] of testMap) {
      let latestStatus: string | undefined;
      for (const ex of sortedExecs) {
        const s = meta.byExec.get(ex.issue_id);
        if (s !== undefined) latestStatus = s;
      }
      if (latestStatus === undefined) continue;
      const statusKey = latestStatus.toUpperCase();
      counts[statusKey] = (counts[statusKey] ?? 0) + 1;
      total += 1;
    }

    const allLoaded = pagesLoaded >= pagesExpected && pagesExpected > 0;
    const failedTests: TestRunHistory[] = [];

    if (allLoaded) {
      // Build a map: testKey → bug keys that link to it (via Jira issuelinks).
      const testKeyToBugKeys = new Map<string, string[]>();
      for (const bug of bugs ?? []) {
        for (const link of bug.fields.issue_links ?? []) {
          const linked = link.outward_issue ?? link.inward_issue;
          if (!linked) continue;
          const issueType = linked.fields.issue_type?.name?.toLowerCase() ?? "";
          if (issueType === "test") {
            const existing = testKeyToBugKeys.get(linked.key) ?? [];
            existing.push(bug.key);
            testKeyToBugKeys.set(linked.key, existing);
          }
        }
      }

      for (const [testIssueId, meta] of testMap) {
        const hasPassOrFail = [...meta.byExec.values()].some(
          (s) => FAIL_STATUSES.has(s.toUpperCase()) || PASS_STATUSES.has(s.toUpperCase()),
        );
        if (!hasPassOrFail) continue;
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
          linkedBugKeys: testKeyToBugKeys.get(meta.testKey) ?? [],
        });
      }

      const ORDER: Record<TestRunHistory["classification"], number> = {
        failing: 0,
        flaky: 1,
        "never-passed": 2,
        fixed: 3,
      };
      failedTests.sort((a, b) => ORDER[a.classification] - ORDER[b.classification]);
    }

    return { counts, total, pagesLoaded, pagesExpected, failedTests };
  }, [executions, extraPageQueries, phase1, phase2, bugs]);
}
