/**
 * Internal helpers shared across all xray-mutations submodules.
 * Not re-exported from the public barrel — import directly from this file.
 */
import { type InfiniteData, useQueryClient } from "@tanstack/react-query";
import type { TestRun, TestRunsPage } from "@/types";
import { queryKeys } from "../queryKeys";

export type TestRunsInfiniteData = InfiniteData<TestRunsPage>;

/** Map over every test run across all pages of an InfiniteData structure. */
export function mapRunsAcrossPages(
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

export function debouncedInvalidateTestRuns(
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
      // Also invalidate the execution summary (progress bar on ExecRow)
      void queryClient.invalidateQueries({
        queryKey: ["xray", "exec-summary", executionIssueId],
      });
      // Invalidate batch summaries that may include this execution
      void queryClient.invalidateQueries({
        queryKey: ["xray", "exec-summary-batch"],
      });
    }, DEBOUNCE_MS),
  );
}

/** Same debounce pattern for iteration step results (keyed by testRunId). */
const pendingStepInvalidations = new Map<string, ReturnType<typeof setTimeout>>();

export function debouncedInvalidateStepResults(
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
