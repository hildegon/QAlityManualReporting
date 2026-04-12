import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  JiraBug,
  JiraComponent,
  JiraIssueDetail,
  JiraIssueLinkType,
  JiraIssueLink,
  JiraProject,
  JiraTransition,
  JiraUser,
  JiraVersion,
  VersionRelatedWork,
} from "@/types";
import * as api from "../tauri";
import { queryKeys } from "./queryKeys";

// ── Jira ──────────────────────────────────────────────────────────────────────

export function useJiraProjects() {
  return useQuery<JiraProject[]>({
    queryKey: queryKeys.jiraProjects,
    queryFn: api.getJiraProjects,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: Infinity,
    meta: { persist: true },
  });
}

/**
 * Fetch all components for a Jira project.
 * Only runs when Jira is configured (i.e. the command won't error).
 * Callers should check `isError` and fall back to free-text input if needed.
 */
export function useProjectComponents(projectKey: string | null | undefined) {
  return useQuery<JiraComponent[]>({
    queryKey: queryKeys.projectComponents(projectKey!),
    queryFn: () => api.getProjectComponents(projectKey!),
    enabled: !!projectKey,
    staleTime: 10 * 60 * 1000, // components rarely change
    gcTime: Infinity,
    meta: { persist: true },
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

/** Resolve a Jira account ID to a display name. Cached for the session. */
export function useUserDisplayName(accountId: string | null | undefined) {
  return useQuery<string>({
    queryKey: queryKeys.userDisplayName(accountId ?? ""),
    queryFn: () => api.getUserDisplayName(accountId!),
    enabled: !!accountId,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
    meta: { persist: true },
  });
}

// ── Transition Jira issue ─────────────────────────────────────────────────────

interface TransitionIssueVars {
  issueKey: string;
  transitionId: string;
  /** Execution project key — used to invalidate the executions list on success. */
  executionProjectKey: string;
  /** If set, the versionIssues query for this version is also invalidated. */
  versionName?: string;
}

/** Apply a workflow transition to a Jira issue and invalidate the executions list. */
export function useTransitionIssue() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, TransitionIssueVars>({
    mutationFn: ({ issueKey, transitionId }) => api.transitionIssue(issueKey, transitionId),
    onSuccess: (_data, { issueKey, executionProjectKey, versionName }) => {
      // Invalidate transitions cache so re-opening the dialog shows fresh options
      void queryClient.invalidateQueries({
        queryKey: queryKeys.issueTransitions(issueKey),
      });
      // Refresh the issue detail modal if it's open
      void queryClient.invalidateQueries({
        queryKey: queryKeys.issueDetail(issueKey),
      });
      // Refresh the executions list to show the updated status
      void queryClient.invalidateQueries({
        queryKey: queryKeys.testExecutions(executionProjectKey),
      });
      // Refresh version issues panel if a version context was provided
      if (versionName) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.versionIssues(executionProjectKey, versionName),
        });
      }
    },
  });
}

/** Post a plain-text comment to a Jira issue, then upload any attachments. */
export function useAddJiraComment() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { issueKey: string; body: string; attachmentPaths?: string[] }>({
    mutationFn: async ({ issueKey, body, attachmentPaths = [] }) => {
      await api.addJiraComment(issueKey, body);
      for (const path of attachmentPaths) {
        await api.addAttachment(issueKey, path);
      }
    },
    onSuccess: (_data, { issueKey }) => {
      // Refresh the issue detail modal so the new comment appears immediately.
      void queryClient.invalidateQueries({ queryKey: queryKeys.issueDetail(issueKey) });
    },
  });
}

/** Apply a workflow transition to any Jira issue without execution-specific cache side-effects. */
export function useApplyTransition() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { issueKey: string; transitionId: string }>({
    mutationFn: ({ issueKey, transitionId }) => api.transitionIssue(issueKey, transitionId),
    onSuccess: (_data, { issueKey }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.issueTransitions(issueKey) });
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

// ── Update Jira issue fix version ────────────────────────────────────────────

interface UpdateExecutionFixVersionVars {
  issueKey: string;
  versionId: string;
  /** Execution project key — used to invalidate the executions list on success. */
  executionProjectKey: string;
}

/** Update (or clear) the fix version of a Test Execution and invalidate the executions list. */
export function useUpdateExecutionFixVersion() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, UpdateExecutionFixVersionVars>({
    mutationFn: ({ issueKey, versionId }) => api.updateIssueFixVersion(issueKey, versionId),
    onSuccess: (_data, { executionProjectKey }) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.testExecutions(executionProjectKey),
      });
    },
  });
}

// ── Jira Versions ─────────────────────────────────────────────────────────────

/** Fetch all versions for a Jira project. */
export function useProjectVersions(projectKey: string | null) {
  return useQuery<JiraVersion[]>({
    queryKey: queryKeys.projectVersions(projectKey!),
    queryFn: () => api.getProjectVersions(projectKey!),
    enabled: !!projectKey,
    staleTime: 5 * 60 * 1_000,
    gcTime: Infinity,
    meta: { persist: true },
  });
}

/** Create a new Jira project version and refresh the versions list. */
export function useCreateVersion(projectKey: string) {
  const queryClient = useQueryClient();
  return useMutation<
    JiraVersion,
    Error,
    { projectId: string; name: string; description?: string; startDate?: string; releaseDate?: string }
  >({
    mutationFn: ({ projectId, name, description, startDate, releaseDate }) =>
      api.createVersion(projectId, name, description, startDate, releaseDate),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projectVersions(projectKey) });
    },
  });
}

/** Update an existing Jira project version and refresh the versions list. */
export function useUpdateVersion(projectKey: string) {
  const queryClient = useQueryClient();
  return useMutation<
    JiraVersion,
    Error,
    {
      versionId: string;
      name?: string;
      description?: string;
      released?: boolean;
      archived?: boolean;
      startDate?: string;
      releaseDate?: string;
    }
  >({
    mutationFn: ({ versionId, name, description, released, archived, startDate, releaseDate }) =>
      api.updateVersion(versionId, name, description, released, archived, startDate, releaseDate),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projectVersions(projectKey) });
    },
  });
}

// ── Version properties ────────────────────────────────────────────────────────

/** Fetch a custom property from a Jira version. Returns null if not yet set. */
export function useVersionProperty(versionId: string | null, propertyKey: string) {
  return useQuery<string | null>({
    queryKey: queryKeys.versionProperty(versionId ?? "", propertyKey),
    queryFn: () => api.getVersionProperty(versionId!, propertyKey),
    enabled: !!versionId,
    staleTime: 5 * 60 * 1_000,
    gcTime: Infinity,
    retry: false,
  });
}

/** Set a custom property on a Jira version and invalidate its cache. */
export function useSetVersionProperty(versionId: string, propertyKey: string) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (value) => api.setVersionProperty(versionId, propertyKey, value),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.versionProperty(versionId, propertyKey),
      });
    },
  });
}

/** Delete a custom property from a Jira version and invalidate its cache. */
export function useDeleteVersionProperty(versionId: string, propertyKey: string) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: () => api.deleteVersionProperty(versionId, propertyKey),
    onSuccess: () => {
      queryClient.setQueryData(
        queryKeys.versionProperty(versionId, propertyKey),
        null,
      );
    },
  });
}

// ── Version related work ──────────────────────────────────────────────────────

/** Fetch all "Related Work" entries for a Jira version. */
export function useVersionRelatedWork(versionId: string | null) {
  return useQuery<VersionRelatedWork[]>({
    queryKey: queryKeys.versionRelatedWork(versionId ?? ""),
    queryFn: () => api.getVersionRelatedWork(versionId!),
    enabled: !!versionId,
    staleTime: 5 * 60 * 1_000,
    gcTime: Infinity,
    retry: false,
  });
}

/** Create a "Related Work" entry on a Jira version and invalidate its cache. */
export function useCreateVersionRelatedWork(versionId: string) {
  const queryClient = useQueryClient();
  return useMutation<
    VersionRelatedWork,
    Error,
    { category: string; title: string; url: string }
  >({
    mutationFn: ({ category, title, url }) =>
      api.createVersionRelatedWork(versionId, category, title, url),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.versionRelatedWork(versionId),
      });
    },
  });
}

/** Delete a "Related Work" entry from a Jira version and invalidate its cache. */
export function useDeleteVersionRelatedWork(versionId: string) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string, VersionRelatedWork[] | undefined>({
    mutationFn: (relatedWorkId) =>
      api.deleteVersionRelatedWork(versionId, relatedWorkId),
    onMutate: async (relatedWorkId) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.versionRelatedWork(versionId),
      });
      const previous = queryClient.getQueryData<VersionRelatedWork[]>(
        queryKeys.versionRelatedWork(versionId),
      );
      queryClient.setQueryData<VersionRelatedWork[]>(
        queryKeys.versionRelatedWork(versionId),
        (old) => old?.filter((rw) => rw.relatedWorkId !== relatedWorkId) ?? [],
      );
      return previous;
    },
    onError: (_err, _vars, previous) => {
      if (previous !== undefined) {
        queryClient.setQueryData(
          queryKeys.versionRelatedWork(versionId),
          previous,
        );
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.versionRelatedWork(versionId),
      });
    },
  });
}

// ── Issue link types ──────────────────────────────────────────────────────────

/** Fetch all issue link types configured in the Jira instance. */
export function useIssueLinkTypes(enabled = true) {
  return useQuery<JiraIssueLinkType[]>({
    queryKey: queryKeys.issueLinkTypes,
    queryFn: api.getIssueLinkTypes,
    enabled,
    staleTime: 10 * 60 * 1_000,
    gcTime: Infinity,
    meta: { persist: true },
  });
}

// ── Bugs by Version ───────────────────────────────────────────────────────────

/** Fetch Bug issues with the given affectedVersion in a Jira project. */
export function useBugsByVersion(projectKey: string | null, versionName: string | null) {
  return useQuery<JiraBug[]>({
    queryKey: queryKeys.bugsByVersion(projectKey!, versionName!),
    queryFn: () => api.getBugsByVersion(projectKey!, versionName!),
    enabled: !!projectKey && !!versionName,
    staleTime: 5 * 60 * 1_000,
    gcTime: Infinity,
    meta: { persist: true },
  });
}

// ── Issue Detail ───────────────────────────────────────────────────────────────

/** Fetch a single Jira issue detail (with plain-text description). Only runs when issueKey is set. */
export function useIssueDetail(issueKey: string | null) {
  return useQuery<JiraIssueDetail>({
    queryKey: queryKeys.issueDetail(issueKey ?? ""),
    queryFn: () => api.getIssueDetail(issueKey!),
    enabled: !!issueKey,
    staleTime: Infinity,
    gcTime: Infinity,
    meta: { persist: true },
  });
}

/**
 * Fetch a Jira attachment as a base64 data URI.
 * Pass `null` for `contentUrl` to disable the query.
 */
export function useAttachmentFile(contentUrl: string | null, mimeType: string) {
  return useQuery<string>({
    queryKey: queryKeys.attachment(contentUrl ?? ""),
    queryFn: () => api.fetchAttachmentToTemp(contentUrl!, mimeType),
    enabled: !!contentUrl,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

// ── Version Issues (Stories, Tasks, Bugs by fixVersion) ───────────────────────

/** Fetch Story, Task, and Bug issues with the given fixVersion in a Jira project. */
export function useVersionIssues(projectKey: string | null, versionName: string | null) {
  return useQuery<JiraBug[]>({
    queryKey: queryKeys.versionIssues(projectKey!, versionName!),
    queryFn: () => api.getVersionIssues(projectKey!, versionName!),
    enabled: !!projectKey && !!versionName,
    staleTime: 5 * 60 * 1_000,
    gcTime: Infinity,
    meta: { persist: true },
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

// ── Rename issue (summary) ────────────────────────────────────────────────────

interface RenameIssueVars {
  /** Jira issue key, e.g. "PROJ-42". */
  issueKey: string;
  /** New summary text. */
  summary: string;
  /**
   * TanStack Query cache key to optimistically update and later invalidate.
   * Pass the result of `queryKeys.testPlans(pk)`, `queryKeys.testExecutions(pk)`, etc.
   */
  queryKey: readonly unknown[];
}

/**
 * Rename any Jira issue (Test Plan, Test Set, Test Execution) by updating its summary field.
 *
 * Performs an optimistic cache update so the UI reflects the new name instantly,
 * and rolls back on error. The cache is invalidated on settle to stay in sync.
 */
export function useRenameIssue() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, RenameIssueVars>({
    mutationFn: ({ issueKey, summary }) => api.updateIssueSummary(issueKey, summary),

    onMutate: async ({ issueKey, summary, queryKey }) => {
      await queryClient.cancelQueries({ queryKey });

      // Snapshot the previous value for rollback.
      const previous = queryClient.getQueryData(queryKey);

      // Optimistically patch the `jira.summary` field on the matching item.
      queryClient.setQueryData(queryKey, (old: unknown) => {
        if (!Array.isArray(old)) return old;
        return old.map((item: { issue_id?: string; jira?: { key?: string; summary?: string } }) => {
          // Match by issue_id (Xray lists) or by jira.key (Jira-keyed lists).
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
      if (ctx) {
        queryClient.setQueryData(ctx.queryKey, ctx.previous);
      }
    },

    onSettled: (_data, _err, { queryKey }) => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });
}

// ── Create Bug ────────────────────────────────────────────────────────────────

interface CreateBugVars {
  projectKey: string;
  /** The version name — needed to key the cache for optimistic update. */
  versionName: string;
  summary: string;
  affectedVersionId: string;
  description?: string;
  componentId?: string;
  assigneeAccountId?: string;
  assigneeDisplayName?: string;
  /** Local file paths to attach after bug creation. */
  attachmentPaths?: string[];
}

import type { CreateBugResult } from "@/types";

export function useCreateBug() {
  const queryClient = useQueryClient();
  return useMutation<CreateBugResult, Error, CreateBugVars>({
    mutationFn: async ({
      projectKey,
      summary,
      affectedVersionId,
      description,
      componentId,
      assigneeAccountId,
      attachmentPaths = [],
    }) => {
      const result = await api.createBug(
        projectKey,
        summary,
        affectedVersionId,
        description,
        componentId,
        assigneeAccountId,
      );
      for (const path of attachmentPaths) {
        await api.addAttachment(result.key, path);
      }
      return result;
    },
    onMutate: async ({ projectKey, versionName, summary, assigneeAccountId, assigneeDisplayName }) => {
      const queryKey = queryKeys.bugsByVersion(projectKey, versionName);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<JiraBug[]>(queryKey);

      const optimisticFields: JiraBug["fields"] = {
        summary,
        status: { name: "Open", category: { key: "new", name: "To Do" } },
        issue_type: { name: "Bug" },
        issue_links: [],
      };
      if (assigneeAccountId && assigneeDisplayName) {
        optimisticFields.assignee = {
          account_id: assigneeAccountId,
          display_name: assigneeDisplayName,
        };
      }
      const optimisticBug: JiraBug = {
        id: `optimistic-${Date.now()}`,
        key: "…",
        fields: optimisticFields,
      };

      queryClient.setQueryData<JiraBug[]>(queryKey, (old) => [optimisticBug, ...(old ?? [])]);
      return { previous, queryKey };
    },
    onError: (_err, _vars, context) => {
      const ctx = context as { previous: JiraBug[] | undefined; queryKey: readonly unknown[] } | undefined;
      if (ctx) queryClient.setQueryData(ctx.queryKey, ctx.previous);
    },
    onSettled: (_data, _err, { projectKey, versionName }) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.bugsByVersion(projectKey, versionName),
      });
    },
  });
}
