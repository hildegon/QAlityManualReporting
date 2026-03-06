/**
 * TanStack Query hooks for all data-fetching operations.
 * Mutations use optimistic updates for instant UI feedback.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import type { AppConfig, CreateTestExecutionResult, JiraProject, TestExecution, TestPlan, TestRun, XrayTestRunStatus } from "@/types";
import * as api from "./tauri";

// ── Query keys ────────────────────────────────────────────────────────────────

export const queryKeys = {
  config: ["config"] as const,
  jiraProjects: ["jira", "projects"] as const,
  testPlans: (projectKey: string) => ["xray", "test-plans", projectKey] as const,
  testExecutions: (projectKey: string) => ["xray", "test-executions", projectKey] as const,
  testRuns: (executionIssueId: string) => ["xray", "test-runs", executionIssueId] as const,
  xrayStatuses: (projectId: string) => ["xray", "statuses", projectId] as const,
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
    staleTime: 60 * 1000, // 1 minute
  });
}

// ── Test Runs ─────────────────────────────────────────────────────────────────

export function useTestRuns(executionIssueId: string | null) {
  return useQuery<TestRun[]>({
    queryKey: queryKeys.testRuns(executionIssueId ?? ""),
    queryFn: () => api.getTestRuns(executionIssueId!),
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

      const previous = queryClient.getQueryData<TestRun[]>(key);
      queryClient.setQueryData<TestRun[]>(key, (old) =>
        old?.map((run) =>
          run.id === testRunId ? { ...run, status: { ...run.status, name: status } } : run,
        ),
      );
      return { previous };
    },

    // Roll back on failure
    onError: (_err, { executionIssueId }, context) => {
      const ctx = context as { previous?: TestRun[] } | undefined;
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
      const previous = queryClient.getQueryData<TestRun[]>(key);
      queryClient.setQueryData<TestRun[]>(key, (old) =>
        old?.map((run) => (run.id === testRunId ? { ...run, comment } : run)),
      );
      return { previous };
    },

    onError: (_err, { executionIssueId }, context) => {
      const ctx = context as { previous?: TestRun[] } | undefined;
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
  projectId: string;
  projectKey: string;
  summary: string;
  testPlanId?: string | undefined;
  description?: string | undefined;
}

export function useCreateTestExecution() {
  const queryClient = useQueryClient();
  return useMutation<CreateTestExecutionResult, Error, CreateExecutionVars>({
    mutationFn: ({ projectId, summary, testPlanId, description }) =>
      api.createTestExecution(projectId, summary, testPlanId, description),
    onSuccess: (_data, { projectKey }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.testExecutions(projectKey) });
    },
  });
}
