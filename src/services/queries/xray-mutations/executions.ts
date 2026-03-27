/**
 * Mutations for test execution containers:
 * create execution, add tests to execution.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateTestExecutionResult } from "@/types";
import * as api from "../../tauri";
import { queryKeys } from "../queryKeys";

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

// ── Add tests to test execution ───────────────────────────────────────────────

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
      void queryClient.invalidateQueries({ queryKey: queryKeys.testRuns(testExecIssueId) });
      // Refresh the executions list so run counts stay accurate.
      void queryClient.invalidateQueries({
        queryKey: queryKeys.testExecutions(executionProjectKey),
      });
    },
  });
}
