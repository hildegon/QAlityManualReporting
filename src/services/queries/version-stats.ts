import { useMemo, useRef } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import type { JiraBug, TestExecution, TestRunStatsPage, TestRunStatusesPage } from "@/types";
import * as api from "../tauri";
import {
  FAIL_STATUSES,
  PASS_STATUSES,
  normalizeStatusKey,
} from "@/constants/statuses";
import { queryKeys, EXEC_SUMMARY_PAGE_SIZE } from "./queryKeys";

// ── Version run statistics ────────────────────────────────────────────────────

/**
 * Page size for version-stats aggregation. Uses the lightweight
 * `get_test_run_stats` command (status + test identity only — no steps,
 * iterations, Gherkin, or evidence), so 100 results per page is fast and
 * covers most executions in a single call.
 */
const VERSION_STATS_PAGE_SIZE = 100;

// ── Version run statistics ────────────────────────────────────────────────────

/**
 * A single test's result history across all executions in the version.
 * Entries are ordered by execution Jira key (ascending, i.e. earliest first).
 */
export interface TestRunHistory {
  /** Stable Xray test issue ID — the same test across all executions. */
  testIssueId: string;
  testKey: string;
  testSummary: string;
  /** Normalized test type used for failure prioritization in the Versions UI. */
  testType: "manual" | "cucumber" | "generic" | "unknown";
  /** Raw Xray test type name when available. */
  testTypeName?: string;
  /**
   * One entry per execution in which this test appeared, sorted by execution
   * key ascending (proxy for chronological order since no date is available).
   */
  history: Array<{
    executionKey: string;
    executionIssueId: string;
    statusName: string;
  }>;
  /**
   * Classification derived from the history:
   *  - "fixed"      — ever failed/blocked, but the *last* result is a pass
   *  - "failing"    — last result is a failure or blocked status
   *  - "flaky"      — multiple executions with mixed pass/fail results
   *  - "never-passed" — only one execution and it failed (no trend yet)
   */
  classification: "fixed" | "failing" | "flaky" | "never-passed";
  /**
   * Keys of bugs in Jira that are linked to this test (via Jira issue links).
   * Only populated when bugs data is passed to useVersionRunStats.
   */
  linkedBugKeys: string[];
}

export interface RunStats {
  /** Counts keyed by uppercased status name, e.g. { PASS: 12, FAIL: 3, TODO: 5 } */
  counts: Record<string, number>;
  /** Total number of test runs across all executions (sum of results loaded). */
  total: number;
  /** How many individual page fetches have completed (for progress indication). */
  pagesLoaded: number;
  /** How many individual page fetches are expected in total. */
  pagesExpected: number;
  /**
   * Per-test history for every test that had at least one non-passing result
   * (FAIL, BLOCKED, or any non-PASS/TODO/EXECUTING status).
   * Only populated once all pages have loaded.
   */
  failedTests: TestRunHistory[];
  /**
   * Per-test history for EVERY test that appeared in any execution, including
   * always-passing tests. Used by the execution comparison panel.
   * Only populated once all pages have loaded; empty array while loading.
   */
  allTests: TestRunHistory[];
}

// PASS_STATUSES and FAIL_STATUSES imported from @/constants/statuses

function classifyHistory(history: TestRunHistory["history"]): TestRunHistory["classification"] {
  if (history.length === 0) return "failing";
  const last = history[history.length - 1]!;
  const lastStatus = last.statusName.toUpperCase();
  const isLastPass = PASS_STATUSES.has(lastStatus);
  const hadFailure = history.some((h) => FAIL_STATUSES.has(h.statusName.toUpperCase()));

  if (isLastPass && hadFailure) return "fixed";
  if (!isLastPass && hadFailure) {
    // Flaky: had at least one pass before the last failure
    const hadPass = history.slice(0, -1).some((h) => PASS_STATUSES.has(h.statusName.toUpperCase()));
    return hadPass ? "flaky" : history.length > 1 ? "failing" : "never-passed";
  }
  return "failing";
}

function normalizeTestType(
  testType?: { name?: string; kind?: string },
): TestRunHistory["testType"] {
  const name = `${testType?.name ?? ""} ${testType?.kind ?? ""}`.toLowerCase();
  if (name.includes("manual")) return "manual";
  if (name.includes("cucumber") || name.includes("gherkin")) return "cucumber";
  if (name.includes("generic") || name.includes("unstructured")) return "generic";
  return "unknown";
}

/**
 * Aggregates test-run status counts AND per-test failure history across all
 * executions in a version.
 *
 * Cache-key safety: uses the prefix "version-run-stats" to avoid colliding with
 * the `useInfiniteQuery` cache entries written by `useTestRuns` (which uses
 * `queryKeys.testRuns`). Both hooks call similar Rust commands but write
 * incompatible data shapes.
 *
 * Strategy (single-phase windowed fetch):
 *   Uses the lightweight `get_test_run_stats` command (status + test identity
 *   only — no steps, iterations, or Gherkin) with page size 100.  Most
 *   executions fit in a single page. For larger executions the extra pages are
 *   derived once the first page settles, added to the same windowed queue, and
 *   fetched with the same concurrency cap.
 */
export function useVersionRunStats(executions: TestExecution[], bugs?: JiraBug[]): RunStats {
  const PAGE_SIZE = VERSION_STATS_PAGE_SIZE;
  /** Max parallel API calls to avoid 429 rate-limit errors. */
  const MAX_CONCURRENT = 6;

  // ── Build the full list of page requests ──────────────────────────────────
  // Start with page 0 for every execution.  As page-0 results arrive and
  // reveal `total`, we dynamically expand the list with extra pages.
  const settledRef = useRef(0);

  // Phase 1: one query per execution (page 0)
  const page0Queries = useQueries({
    queries: executions.map((ex, i) => ({
      queryKey: ["version-run-stats", ex.issue_id, 0] as const,
      queryFn: () => api.getTestRunStats(ex.issue_id, PAGE_SIZE, 0),
      staleTime: 15 * 60 * 1_000,
      gcTime: Infinity,
      enabled: executions.length > 0 && i < settledRef.current + MAX_CONCURRENT,
      meta: { persist: true },
    })),
  });

  settledRef.current = page0Queries.filter((q) => q.isSuccess || q.isError).length;

  // Derive extra pages from settled page-0 results.
  // We use the count of successfully-settled page-0 queries as a stable scalar dep instead of
  // the page0Queries array itself (which gets a new reference every render from useQueries).
  const page0SuccessCount = page0Queries.filter((q) => q.isSuccess).length;
  const extraPageQueries = useMemo(() => {
    const queries: { issueId: string; start: number }[] = [];
    for (let i = 0; i < executions.length; i++) {
      const page0 = page0Queries[i]?.data;
      if (!page0 || !executions[i]) continue;
      for (let start = PAGE_SIZE; start < page0.total; start += PAGE_SIZE) {
        queries.push({ issueId: executions[i]!.issue_id, start });
      }
    }
    return queries;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [executions, PAGE_SIZE, page0SuccessCount]);

  const extraSettledRef = useRef(0);

  const extraQueries = useQueries({
    queries: extraPageQueries.map(({ issueId, start }, i) => ({
      queryKey: ["version-run-stats", issueId, start] as const,
      queryFn: () => api.getTestRunStats(issueId, PAGE_SIZE, start),
      staleTime: 15 * 60 * 1_000,
      gcTime: Infinity,
      enabled: extraPageQueries.length > 0 && i < extraSettledRef.current + MAX_CONCURRENT,
      meta: { persist: true },
    })),
  });

  extraSettledRef.current = extraQueries.filter((q) => q.isSuccess || q.isError).length;

  // ── Aggregate ────────────────────────────────────────────────────────────────
  return useMemo(() => {
    let pagesLoaded = 0;
    const pagesExpected = executions.length + extraPageQueries.length;

    // Map from testIssueId → { meta, status per execution (all statuses tracked) }
    const testMap = new Map<
      string,
      {
        testKey: string;
        testSummary: string;
        testType: TestRunHistory["testType"];
        testTypeName?: string;
        byExec: Map<string, string>;
      }
    >();

    const processPage = (page: TestRunStatsPage | undefined, executionIssueId: string) => {
      if (!page) return;
      pagesLoaded += 1;
      for (const run of page.results) {
        const tid = run.test.issue_id;
        const testType = normalizeTestType(run.test.test_type ?? run.test_type);
        if (!testMap.has(tid)) {
          testMap.set(tid, {
            testKey: run.test.jira.key,
            testSummary: run.test.jira.summary,
            testType,
            ...(run.test_type?.name ? { testTypeName: run.test_type.name } : {}),
            byExec: new Map(),
          });
        }
        const existing = testMap.get(tid)!;
        if (existing.testType === "unknown" && testType !== "unknown") {
          existing.testType = testType;
          if (run.test_type?.name) {
            existing.testTypeName = run.test_type.name;
          }
        }
        existing.byExec.set(executionIssueId, run.status.name);
      }
    };

    for (let i = 0; i < executions.length; i++) {
      processPage(page0Queries[i]?.data, executions[i]?.issue_id ?? "");
    }
    for (let i = 0; i < extraPageQueries.length; i++) {
      processPage(extraQueries[i]?.data, extraPageQueries[i]?.issueId ?? "");
    }

    // Sort executions by Jira key (ascending = chronological) so that
    // "latest execution" means the one with the highest key number.
    const sortedExecs = [...executions].sort((a, b) =>
      a.jira.key.localeCompare(b.jira.key, undefined, { numeric: true }),
    );

    // Derive deduplicated counts: each unique test contributes exactly once,
    // using the status from the latest execution that ran it.
    const counts: Record<string, number> = {};
    let total = 0;

    for (const [, meta] of testMap) {
      let latestStatus: string | undefined;
      for (const ex of sortedExecs) {
        const s = meta.byExec.get(ex.issue_id);
        if (s !== undefined) latestStatus = s;
      }
      if (latestStatus === undefined) continue;

      const statusKey = normalizeStatusKey(latestStatus);
      counts[statusKey] = (counts[statusKey] ?? 0) + 1;
      total += 1;
    }

    // Build TestRunHistory only for tests that had at least one failure/block.
    const allLoaded = pagesLoaded >= pagesExpected && pagesExpected > 0;
    const failedTests: TestRunHistory[] = [];
    const allTests: TestRunHistory[] = [];

    if (allLoaded) {
      const testKeyToBugKeys = new Map<string, string[]>();
      for (const bug of bugs ?? []) {
        for (const link of bug.fields.issue_links ?? []) {
          const linked = link.outward_issue ?? link.inward_issue;
          if (!linked) continue;
          const issueType = linked.fields.issue_type?.name?.toLowerCase() ?? "";
          if (issueType === "test") {
            const existing = testKeyToBugKeys.get(linked.key) ?? [];
            existing.push(bug.key);
            testKeyToBugKeys.set(linked.key, existing);
          }
        }
      }

      for (const [testIssueId, meta] of testMap) {
        const history: TestRunHistory["history"] = sortedExecs
          .filter((ex) => meta.byExec.has(ex.issue_id))
          .map((ex) => ({
            executionKey: ex.jira.key,
            executionIssueId: ex.issue_id,
            statusName: meta.byExec.get(ex.issue_id)!,
          }));

        const entry: TestRunHistory = {
          testIssueId,
          testKey: meta.testKey,
          testSummary: meta.testSummary,
          testType: meta.testType,
          ...(meta.testTypeName ? { testTypeName: meta.testTypeName } : {}),
          history,
          classification: classifyHistory(history),
          linkedBugKeys: testKeyToBugKeys.get(meta.testKey) ?? [],
        };

        allTests.push(entry);

        const hasPassOrFail = [...meta.byExec.values()].some(
          (s) => FAIL_STATUSES.has(s.toUpperCase()) || PASS_STATUSES.has(s.toUpperCase()),
        );
        if (!hasPassOrFail) continue;

        const hadFailure = [...meta.byExec.values()].some((s) =>
          FAIL_STATUSES.has(s.toUpperCase()),
        );
        if (!hadFailure) continue;

        failedTests.push(entry);
      }

      allTests.sort((a, b) => a.testKey.localeCompare(b.testKey, undefined, { numeric: true }));

      const ORDER: Record<TestRunHistory["classification"], number> = {
        failing: 0,
        flaky: 1,
        "never-passed": 2,
        fixed: 3,
      };
      const TEST_TYPE_ORDER: Record<TestRunHistory["testType"], number> = {
        manual: 0,
        unknown: 1,
        cucumber: 2,
        generic: 3,
      };
      failedTests.sort((a, b) => {
        const classDiff = ORDER[a.classification] - ORDER[b.classification];
        if (classDiff !== 0) return classDiff;

        const typeDiff = TEST_TYPE_ORDER[a.testType] - TEST_TYPE_ORDER[b.testType];
        if (typeDiff !== 0) return typeDiff;

        return a.testKey.localeCompare(b.testKey);
      });
    }

    return { counts, total, pagesLoaded, pagesExpected, failedTests, allTests };
  }, [executions, extraPageQueries, page0Queries, extraQueries, bugs]);
}

// ── Execution run summary ─────────────────────────────────────────────────────

export interface ExecSummary {
  counts: Record<string, number>;
  total: number;
  hasMore: boolean;
  isLoading: boolean;
}

/**
 * Fetches status counts for all test runs in a single execution.
 *
 * Uses the lightweight `get_test_run_statuses` command (status name only —
 * no steps, iterations, or Gherkin) with a page size of 100. A single call
 * covers most test executions in full. For executions with > 100 runs, the
 * remaining pages are fetched in parallel (capped at 3 concurrent requests).
 *
 * Results are used to render the mini progress bar on each ExecRow card.
 */
export function useExecutionRunSummary(executionIssueId: string | null): ExecSummary {
  const enabled = !!executionIssueId;
  const MAX_CONCURRENT = 3;

  // ── Phase 1: first page ────────────────────────────────────────────────────
  const phase1 = useQuery<TestRunStatusesPage>({
    queryKey: queryKeys.execSummary(executionIssueId ?? "", 0),
    queryFn: () => api.getTestRunStatuses(executionIssueId!, EXEC_SUMMARY_PAGE_SIZE, 0),
    enabled,
    staleTime: 15 * 60 * 1_000,
    gcTime: Infinity,
    meta: { persist: true },
  });

  // ── Phase 2: remaining pages (only if total > page size) ───────────────────
  const extraStarts = useMemo<number[]>(() => {
    const total = phase1.data?.total ?? 0;
    if (!phase1.data || total <= EXEC_SUMMARY_PAGE_SIZE) return [];
    const starts: number[] = [];
    for (let s = EXEC_SUMMARY_PAGE_SIZE; s < total; s += EXEC_SUMMARY_PAGE_SIZE) {
      starts.push(s);
    }
    return starts;
  }, [phase1.data]);

  const phase2SettledRef = useRef(0);

  const phase2 = useQueries({
    queries: extraStarts.map((start, i) => ({
      queryKey: queryKeys.execSummary(executionIssueId ?? "", start),
      queryFn: () => api.getTestRunStatuses(executionIssueId!, EXEC_SUMMARY_PAGE_SIZE, start),
      enabled: enabled && extraStarts.length > 0 && i < phase2SettledRef.current + MAX_CONCURRENT,
      staleTime: 15 * 60 * 1_000,
      gcTime: Infinity,
      meta: { persist: true },
    })),
  });

  phase2SettledRef.current = phase2.filter((q) => q.isSuccess || q.isError).length;

  // ── Aggregate counts ───────────────────────────────────────────────────────
  return useMemo(() => {
    const total = phase1.data?.total ?? 0;
    const isLoading = phase1.isLoading || phase2.some((q) => q.isLoading);
    if (!phase1.data) return { counts: {}, total: 0, hasMore: false, isLoading };

    const allPages: TestRunStatusesPage[] = [
      phase1.data,
      ...phase2.map((q) => q.data).filter(Boolean),
    ] as TestRunStatusesPage[];

    const counts: Record<string, number> = {};
    let loaded = 0;
    for (const page of allPages) {
      for (const run of page.results) {
        const k = run.status.name.toUpperCase();
        counts[k] = (counts[k] ?? 0) + 1;
        loaded++;
      }
    }

    return { counts, total, hasMore: loaded < total, isLoading };
  }, [phase1.data, phase1.isLoading, phase2]);
}

// ── Batch execution summaries ─────────────────────────────────────────────────

/**
 * Fetches aggregated status counts for multiple executions in a single
 * backend call. The backend runs all queries concurrently with a semaphore
 * and returns a map of executionIssueId → { counts, total }.
 *
 * Replaces the per-ExecRow `useExecutionRunSummary` pattern when rendering
 * a list of executions.
 */
export function useExecutionSummariesBatch(executionIssueIds: string[]) {
  return useQuery({
    queryKey: queryKeys.execSummaryBatch(executionIssueIds),
    queryFn: () => api.getExecutionSummariesBatch(executionIssueIds),
    enabled: executionIssueIds.length > 0,
    staleTime: 15 * 60 * 1_000,
    gcTime: Infinity,
    meta: { persist: true },
  });
}
