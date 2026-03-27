/**
 * Mutations for test set management:
 * create set, add/remove tests from a set.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateTestSetResult, XrayTestSet } from "@/types";
import * as api from "../../tauri";
import { queryKeys } from "../queryKeys";

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
      void queryClient.invalidateQueries({ queryKey: queryKeys.testSetTests(testSetIssueId) });
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
