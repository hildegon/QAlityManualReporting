/**
 * Mutations for test plan management:
 * create plan, add/remove tests from a plan.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateTestPlanResult } from "@/types";
import * as api from "../../tauri";
import { queryKeys } from "../queryKeys";

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
      void queryClient.invalidateQueries({ queryKey: queryKeys.testPlanTests(testPlanIssueId) });
      // Refresh the top-level plans list in case the plan summary changed.
      void queryClient.invalidateQueries({ queryKey: queryKeys.testPlans(projectKey) });
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
