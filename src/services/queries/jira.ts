/**
 * TanStack Query hooks for Jira REST API operations.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  JiraBug,
  JiraComponent,
  JiraIssueLink,
  JiraIssueLinkType,
  JiraProject,
  JiraTransition,
  JiraUser,
  JiraVersion,
} from "@/types";
import * as api from "@/services/tauri";
import { queryKeys } from "./keys";

export function useJiraProjects() {
  return useQuery<JiraProject[]>({
    queryKey: queryKeys.jiraProjects,
    queryFn: api.getJiraProjects,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Fetch all components for a Jira project.
 * Only runs when Jira is configured (i.e. the command won't error).
 */
export function useProjectComponents(projectKey: string | null | undefined) {
  return useQuery<JiraComponent[]>({
    queryKey: queryKeys.projectComponents(projectKey ?? ""),
    queryFn: () => api.getProjectComponents(projectKey!),
    enabled: !!projectKey,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
}

/** Fetch all versions for a Jira project. */
export function useProjectVersions(projectKey: string | null) {
  return useQuery<JiraVersion[]>({
    queryKey: queryKeys.projectVersions(projectKey ?? ""),
    queryFn: () => api.getProjectVersions(projectKey!),
    enabled: !!projectKey,
    staleTime: 5 * 60 * 1_000,
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
    staleTime: 60 * 1000,
    retry: false,
  });
}

/**
 * Search Jira users by display name or email.
 * Only runs when `query` is at least 2 characters.
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

/** Fetch all issue link types configured in the Jira instance. */
export function useIssueLinkTypes(enabled = true) {
  return useQuery<JiraIssueLinkType[]>({
    queryKey: queryKeys.issueLinkTypes,
    queryFn: api.getIssueLinkTypes,
    enabled,
    staleTime: 10 * 60 * 1_000,
  });
}

/** Fetch Bug issues with the given affectedVersion in a Jira project. */
export function useBugsByVersion(projectKey: string | null, versionName: string | null) {
  return useQuery<JiraBug[]>({
    queryKey: queryKeys.bugsByVersion(projectKey ?? "", versionName ?? ""),
    queryFn: () => api.getBugsByVersion(projectKey!, versionName!),
    enabled: !!projectKey && !!versionName,
    staleTime: 2 * 60 * 1_000,
  });
}

/** Fetch Story, Task, and Bug issues with the given fixVersion in a Jira project. */
export function useVersionIssues(projectKey: string | null, versionName: string | null) {
  return useQuery<JiraBug[]>({
    queryKey: queryKeys.versionIssues(projectKey ?? "", versionName ?? ""),
    queryFn: () => api.getVersionIssues(projectKey!, versionName!),
    enabled: !!projectKey && !!versionName,
    staleTime: 2 * 60 * 1_000,
  });
}

// ── Mutations ─────────────────────────────────────────────────────────────────

interface TransitionIssueVars {
  issueKey: string;
  transitionId: string;
  executionProjectKey: string;
  /** If set, the versionIssues query for this version is also invalidated. */
  versionName?: string;
}

export function useTransitionIssue() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, TransitionIssueVars>({
    mutationFn: ({ issueKey, transitionId }) => api.transitionIssue(issueKey, transitionId),
    onSuccess: (_data, { issueKey, executionProjectKey, versionName }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.issueTransitions(issueKey) });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.testExecutions(executionProjectKey),
      });
      if (versionName) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.versionIssues(executionProjectKey, versionName),
        });
      }
    },
  });
}

interface UpdateAssigneeVars {
  issueKey: string;
  accountId?: string;
  executionProjectKey: string;
}

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

interface RenameIssueVars {
  issueKey: string;
  summary: string;
  queryKey: readonly unknown[];
}

/**
 * Rename any Jira issue by updating its summary field.
 * Performs an optimistic cache update and rolls back on error.
 */
export function useRenameIssue() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, RenameIssueVars>({
    mutationFn: ({ issueKey, summary }) => api.updateIssueSummary(issueKey, summary),
    onMutate: async ({ issueKey, summary, queryKey }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (old: unknown) => {
        if (!Array.isArray(old)) return old;
        return old.map((item: { issue_id?: string; jira?: { key?: string; summary?: string } }) => {
          const key = item.jira?.key ?? "";
          if (item.issue_id === issueKey || key === issueKey) {
            return { ...item, jira: { ...item.jira, summary } };
          }
          return item;
        });
      });
      return { previous, queryKey };
    },
    onError: (_err, _vars, context) => {
      const ctx = context as { previous: unknown; queryKey: readonly unknown[] } | undefined;
      if (ctx) queryClient.setQueryData(ctx.queryKey, ctx.previous);
    },
    onSettled: (_data, _err, { queryKey }) => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });
}

// ── Link bug to test ──────────────────────────────────────────────────────────

interface LinkBugToTestVars {
  bugKey: string;
  testKey: string;
  linkTypeName: string;
  projectKey: string;
  versionName: string;
}

export function useLinkBugToTest() {
  const queryClient = useQueryClient();
  return useMutation<void, string, LinkBugToTestVars>({
    mutationFn: ({ bugKey, testKey, linkTypeName }) =>
      api.createIssueLink(bugKey, testKey, linkTypeName),
    onMutate: async ({ bugKey, testKey, linkTypeName, projectKey, versionName }) => {
      const queryKey = queryKeys.bugsByVersion(projectKey, versionName);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<JiraBug[]>(queryKey);
      queryClient.setQueryData<JiraBug[]>(queryKey, (old) =>
        (old ?? []).map((bug) => {
          if (bug.key !== bugKey) return bug;
          const alreadyLinked = (bug.fields.issue_links ?? []).some(
            (l) => (l.outward_issue?.key ?? l.inward_issue?.key) === testKey,
          );
          if (alreadyLinked) return bug;
          const newLink: JiraIssueLink = {
            id: `optimistic-${testKey}`,
            link_type: { outward: linkTypeName },
            outward_issue: {
              id: testKey,
              key: testKey,
              fields: { summary: testKey, issue_type: { name: "Test" } },
            },
          };
          return {
            ...bug,
            fields: {
              ...bug.fields,
              issue_links: [...(bug.fields.issue_links ?? []), newLink],
            },
          };
        }),
      );
      return { previous, queryKey };
    },
    onError: (_err: string, _vars, context) => {
      const ctx = context as { previous: unknown; queryKey: readonly unknown[] } | undefined;
      if (ctx) queryClient.setQueryData(ctx.queryKey, ctx.previous);
    },
    onSettled: (_data, _err, { projectKey, versionName }) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.bugsByVersion(projectKey, versionName),
      });
    },
  });
}
