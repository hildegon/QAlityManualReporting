/**
 * Mutations that operate on test run execution results:
 * status, comment, step status, step detail, iteration status, defects.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "../../tauri";
import { queryKeys } from "../queryKeys";
import {
  debouncedInvalidateStepResults,
  debouncedInvalidateTestRuns,
  mapRunsAcrossPages,
  type TestRunsInfiniteData,
} from "./helpers";

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

// ── Update test run step status (optimistic) ─────────────────────────────────

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
                              ...(actualResult !== undefined ? { actual_result: actualResult } : {}),
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
      if (ctx?.previous)
        queryClient.setQueryData(queryKeys.testRuns(executionIssueId), ctx.previous);
    },
    onSettled: (_data, _err, { executionIssueId, testRunId }) => {
      debouncedInvalidateTestRuns(queryClient, executionIssueId);
      // Also invalidate the lazy step-results cache so the expanded iteration view
      // reflects any server-side side-effects.
      debouncedInvalidateStepResults(queryClient, testRunId);
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
          run.id === testRunId
            ? { ...run, defects: [...(run.defects ?? []), ...issueKeys] }
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
