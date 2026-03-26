import { useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import type {
  CreateTestExecutionResult,
  CreateTestPlanResult,
  CreateTestResult,
  CreateTestSetResult,
  CreateTestStepInput,
  TestRun,
  TestRunsPage,
  XrayTestSet,
} from "@/types";
import * as api from "../tauri";
import { queryKeys } from "./queryKeys";

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

/**
 * Debounced query invalidation to prevent thundering herd during bulk
 * operations (e.g. 50 status changes that each call onSettled).
 * Multiple calls for the same execution within `DEBOUNCE_MS` are collapsed
 * into a single invalidation.
 */
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
      void queryClient.invalidateQueries({
        queryKey: queryKeys.testRuns(executionIssueId),
      });
    }, DEBOUNCE_MS),
  );
}

/** Same debounce pattern for iteration step results (keyed by testRunId). */
const pendingStepInvalidations = new Map<string, ReturnType<typeof setTimeout>>();

function debouncedInvalidateStepResults(
  queryClient: ReturnType<typeof useQueryClient>,
  testRunId: string,
) {
  const existing = pendingStepInvalidations.get(testRunId);
  if (existing) clearTimeout(existing);

  pendingStepInvalidations.set(
    testRunId,
    setTimeout(() => {
      pendingStepInvalidations.delete(testRunId);
      void queryClient.invalidateQueries({
        queryKey: queryKeys.iterationStepResults(testRunId),
      });
    }, DEBOUNCE_MS),
  );
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

    // Always refetch to confirm server state (debounced for bulk operations)
    onSettled: (_data, _err, { executionIssueId }) => {
      debouncedInvalidateTestRuns(queryClient, executionIssueId);
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
      debouncedInvalidateTestRuns(queryClient, executionIssueId);
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
      debouncedInvalidateTestRuns(queryClient, executionIssueId);
    },
  });
}

// ── Update iteration status (optimistic) ─────────────────────────────────────

interface UpdateIterationStatusVars {
  testRunId: string;
  iterationRank: string;
  status: string;
  executionIssueId: string;
}

/**
 * Set the overall status of a dataset iteration within a test run.
 * Applies an optimistic update to the testRuns infinite cache so the
 * iteration status badge updates instantly, then invalidates to confirm.
 */
export function useUpdateIterationStatus() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, UpdateIterationStatusVars>({
    mutationFn: ({ testRunId, iterationRank, status }) =>
      api.updateIterationStatus(testRunId, iterationRank, status),

    // Optimistic update: patch the matching iteration's status in the cache.
    onMutate: async ({ testRunId, iterationRank, status, executionIssueId }) => {
      const key = queryKeys.testRuns(executionIssueId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<TestRunsInfiniteData>(key);
      queryClient.setQueryData<TestRunsInfiniteData>(key, (old) =>
        mapRunsAcrossPages(old, (run) => {
          if (run.id !== testRunId || !run.iterations) return run;
          return {
            ...run,
            iterations: {
              ...run.iterations,
              results: run.iterations.results.map((iter) =>
                iter.rank === iterationRank
                  ? { ...iter, status: { ...(iter.status ?? {}), name: status } }
                  : iter,
              ),
            },
          };
        }),
      );
      return { previous };
    },

    onError: (_err, { executionIssueId }, context) => {
      const ctx = context as { previous?: TestRunsInfiniteData } | undefined;
      if (ctx?.previous) {
        queryClient.setQueryData(queryKeys.testRuns(executionIssueId), ctx.previous);
      }
    },

    onSettled: (_data, _err, { executionIssueId, testRunId }) => {
      debouncedInvalidateTestRuns(queryClient, executionIssueId);
      // Also invalidate the lazy step-results cache for this run so the
      // expanded iteration view reflects any server-side side-effects.
      debouncedInvalidateStepResults(queryClient, testRunId);
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
      debouncedInvalidateTestRuns(queryClient, executionIssueId);
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

// ── Create Test Set ───────────────────────────────────────────────────────────

export function useCreateTestSet() {
  const queryClient = useQueryClient();
  return useMutation<
    CreateTestSetResult,
    Error,
    { projectKey: string; summary: string; component?: string }
  >({
    mutationFn: ({ projectKey, summary, component }) =>
      api.createTestSet(projectKey, summary, component),
    onSuccess: (data, { projectKey }) => {
      // Append the new test set directly into the cache instead of
      // invalidating + refetching all test sets from Xray (very expensive).
      if (data.test_set) {
        const newSet: XrayTestSet = {
          issue_id: data.test_set.issue_id,
          jira: data.test_set.jira,
        };
        queryClient.setQueryData<XrayTestSet[]>(queryKeys.testSets(projectKey), (old) =>
          old ? [...old, newSet] : [newSet],
        );
      }
    },
  });
}

// ── Add Tests to Test Set ─────────────────────────────────────────────────────

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
      // Refresh the individual test-set member list (right panel).
      void queryClient.invalidateQueries({
        queryKey: queryKeys.testSetTests(testSetIssueId),
      });
      // Refresh the membership map so badges in the Tests panel update immediately.
      void queryClient.invalidateQueries({
        queryKey: queryKeys.testSetMemberships(projectKey),
      });
    },
  });
}

// ── Remove Tests from Test Set ────────────────────────────────────────────────

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
      void queryClient.invalidateQueries({
        queryKey: queryKeys.testSetMemberships(projectKey),
      });
    },
  });
}

// ── Create Test Plan ──────────────────────────────────────────────────────────

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

// ── Add Tests to Test Plan ────────────────────────────────────────────────────

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
      // Refresh the plan's test list so the expanded panel reflects the new members.
      void queryClient.invalidateQueries({
        queryKey: queryKeys.testPlanTests(testPlanIssueId),
      });
      // Refresh the top-level plans list in case the plan summary changed.
      void queryClient.invalidateQueries({
        queryKey: queryKeys.testPlans(projectKey),
      });
    },
  });
}

// ── Add Tests to Test Execution ───────────────────────────────────────────────

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
      // Refresh the test run list inside this execution.
      void queryClient.invalidateQueries({
        queryKey: queryKeys.testRuns(testExecIssueId),
      });
      // Refresh the executions list so run counts stay accurate.
      void queryClient.invalidateQueries({
        queryKey: queryKeys.testExecutions(executionProjectKey),
      });
    },
  });
}

// ── Remove Tests from Test Plan ───────────────────────────────────────────────

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

// ── Add defects to test run ───────────────────────────────────────────────────

interface AddDefectsVars {
  testRunId: string;
  issueKeys: string[];
  executionIssueId: string;
}

/**
 * Optimistically appends defect issue keys to a test run and writes them back
 * to Xray. Rolls back on error, re-fetches on settle.
 */
export function useAddDefectsToTestRun() {
  const queryClient = useQueryClient();
  return useMutation<string[], Error, AddDefectsVars>({
    mutationFn: ({ testRunId, issueKeys }) => api.addDefectsToTestRun(testRunId, issueKeys),
    onMutate: async ({ testRunId, issueKeys, executionIssueId }) => {
      const key = queryKeys.testRuns(executionIssueId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<TestRunsInfiniteData>(key);
      queryClient.setQueryData<TestRunsInfiniteData>(key, (old) =>
        mapRunsAcrossPages(old, (run) =>
          run.id === testRunId ? { ...run, defects: [...(run.defects ?? []), ...issueKeys] } : run,
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
