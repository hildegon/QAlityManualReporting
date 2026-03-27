/**
 * Mutations for test definition management:
 * create test, update/add/remove manual steps.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateTestResult, CreateTestStepInput, XrayTestStep } from "@/types";
import * as api from "../../tauri";
import { queryKeys } from "../queryKeys";

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

// ── Update / Add / Remove Test Step (definition) ──────────────────────────────

interface UpdateTestStepVars {
  issueId: string;
  stepId: string;
  testKey: string;
  action?: string;
  data?: string;
  result?: string;
}

/** Update the content of an existing step on a manual test definition. */
export function useUpdateTestStep() {
  const queryClient = useQueryClient();
  return useMutation<XrayTestStep, Error, UpdateTestStepVars>({
    mutationFn: ({ issueId, stepId, action, data, result }) =>
      api.updateTestStep(issueId, stepId, action, data, result),
    onSuccess: (_data, { testKey }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.testDetail(testKey) });
    },
  });
}

interface AddTestStepVars {
  issueId: string;
  testKey: string;
  action?: string;
  data?: string;
  result?: string;
}

/** Append a new step to an existing manual test definition. */
export function useAddTestStep() {
  const queryClient = useQueryClient();
  return useMutation<XrayTestStep, Error, AddTestStepVars>({
    mutationFn: ({ issueId, action, data, result }) =>
      api.addTestStep(issueId, action, data, result),
    onSuccess: (_data, { testKey }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.testDetail(testKey) });
    },
  });
}

interface RemoveTestStepVars {
  issueId: string;
  stepId: string;
  testKey: string;
}

/** Remove a step from a manual test definition. */
export function useRemoveTestStep() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, RemoveTestStepVars>({
    mutationFn: ({ issueId, stepId }) => api.removeTestStep(issueId, stepId),
    onSuccess: (_data, { testKey }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.testDetail(testKey) });
    },
  });
}
