import { useMemo, useRef } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import type { JiraBug, TestExecution, TestRunsPage } from "@/types";
import * as api from "../tauri";
import { FAIL_STATUSES, PASS_STATUSES } from "@/constants/statuses";
import { queryKeys, STATS_PAGE_SIZE } from "./queryKeys";

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

/**
 * Aggregates test-run status counts AND per-test failure history across all
 * executions in a version.
 *
 * Cache-key safety: phase 1 uses the prefix "version-run-stats" to avoid
 * colliding with the `useInfiniteQuery` cache entries written by `useTestRuns`
 * (which uses `queryKeys.testRuns`). Both hooks call the same Rust command but
 * write incompatible data shapes — regular `TestRunsPage` vs `InfiniteData`.
 *
 * Strategy (two-phase parallel fetch):
 *   Phase 1 — fetch page 0 for every execution simultaneously. Each page 0
 *              response carries `total`, letting us compute extra pages needed.
 *   Phase 2 — fire all remaining pages in parallel.
 *   Aggregate — counts and per-test histories are built from every resolved page.
 */
export function useVersionRunStats(executions: TestExecution[], bugs?: JiraBug[]): RunStats {
  const PAGE_SIZE = STATS_PAGE_SIZE;
  /** Max parallel API calls per phase to avoid 429 rate-limit errors. */
  const MAX_CONCURRENT = 4;

  // ── Phase 1: page 0 per execution (windowed) ────────────────────────────────
  // NOTE: key prefix "version-run-stats" avoids colliding with the InfiniteQuery
  // cache entries that useTestRuns writes under ["xray", "test-runs", issueId].
  //
  // Windowing: only the first (settled + MAX_CONCURRENT) queries are enabled.
  // As queries settle, the component re-renders and the window advances.
  const phase1 = useQueries({
    queries: executions.map((ex) => ({
      queryKey: ["version-run-stats", ex.issue_id, 0] as const,
      queryFn: () => api.getTestRuns(ex.issue_id, PAGE_SIZE, 0),
      staleTime: 5 * 60 * 1_000,
      gcTime: Infinity,
      enabled: executions.length > 0,
      meta: { persist: true },
    })),
  });

  // Count settled (success | error) phase-1 queries to gate phase 2.
  const phase1Settled = phase1.filter((q) => q.isSuccess || q.isError).length;
  const allPhase1Done = phase1Settled === executions.length && executions.length > 0;

  // ── Phase 2: extra pages derived from phase 1 totals (windowed) ──────────────
  const extraPageQueries = useMemo(() => {
    if (!allPhase1Done) return [];
    const queries: { issueId: string; start: number }[] = [];
    for (let i = 0; i < executions.length; i++) {
      const ex = executions[i];
      const page0 = phase1[i]?.data;
      if (!page0 || !ex) continue;
      for (let start = PAGE_SIZE; start < page0.total; start += PAGE_SIZE) {
        queries.push({ issueId: ex.issue_id, start });
      }
    }
    return queries;
  }, [allPhase1Done, executions, PAGE_SIZE, phase1]);

  // Track settled count in a ref to avoid dependency cycles while still
  // advancing the concurrency window on each render.
  const phase2SettledRef = useRef(0);

  const phase2 = useQueries({
    queries: extraPageQueries.map(({ issueId, start }, i) => ({
      queryKey: ["version-run-stats", issueId, start] as const,
      queryFn: () => api.getTestRuns(issueId, PAGE_SIZE, start),
      staleTime: 5 * 60 * 1_000,
      gcTime: Infinity,
      enabled: extraPageQueries.length > 0 && i < phase2SettledRef.current + MAX_CONCURRENT,
      meta: { persist: true },
    })),
  });

  // Update settled count for the next render cycle.
  phase2SettledRef.current = phase2.filter((q) => q.isSuccess || q.isError).length;

  // ── Aggregate ────────────────────────────────────────────────────────────────
  return useMemo(() => {
    let pagesLoaded = 0;
    const pagesExpected = executions.length + extraPageQueries.length;

    // Map from testIssueId → { meta, status per execution (all statuses tracked) }
    // Storing ALL statuses (not just PASS/FAIL) so the donut chart reflects
    // every unique test, not just the ones that passed or failed.
    const testMap = new Map<
      string,
      { testKey: string; testSummary: string; byExec: Map<string, string> }
    >();

    const processPage = (page: TestRunsPage | undefined, executionIssueId: string) => {
      if (!page) return;
      pagesLoaded += 1;
      for (const run of page.results) {
        const tid = run.test.issue_id;
        if (!testMap.has(tid)) {
          testMap.set(tid, {
            testKey: run.test.jira.key,
            testSummary: run.test.jira.summary,
            byExec: new Map(),
          });
        }
        // Last write wins if the same test appears on multiple pages of the same
        // execution (shouldn't happen, but defensive).
        testMap.get(tid)!.byExec.set(executionIssueId, run.status.name);
      }
    };

    for (let i = 0; i < executions.length; i++) {
      processPage(phase1[i]?.data, executions[i]?.issue_id ?? "");
    }
    for (let i = 0; i < extraPageQueries.length; i++) {
      processPage(phase2[i]?.data, extraPageQueries[i]?.issueId ?? "");
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
      // Pick the status from the latest execution that contains this test.
      let latestStatus: string | undefined;
      for (const ex of sortedExecs) {
        const s = meta.byExec.get(ex.issue_id);
        if (s !== undefined) latestStatus = s; // later exec overwrites earlier
      }
      if (latestStatus === undefined) continue;

      const statusKey = latestStatus.toUpperCase();
      counts[statusKey] = (counts[statusKey] ?? 0) + 1;
      total += 1;
    }

    // Build TestRunHistory only for tests that had at least one failure/block.
    // The history spans all executions (unchanged behaviour).
    const allLoaded = pagesLoaded >= pagesExpected && pagesExpected > 0;
    const failedTests: TestRunHistory[] = [];

    if (allLoaded) {
      // Build a map: testKey → bug keys that link to it (via Jira issuelinks).
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
        // Only include tests whose byExec map contains a PASS or FAIL status
        // (same gate as before — TODO/EXECUTING tests are excluded from history).
        const hasPassOrFail = [...meta.byExec.values()].some(
          (s) => FAIL_STATUSES.has(s.toUpperCase()) || PASS_STATUSES.has(s.toUpperCase()),
        );
        if (!hasPassOrFail) continue;

        const hadFailure = [...meta.byExec.values()].some((s) =>
          FAIL_STATUSES.has(s.toUpperCase()),
        );
        if (!hadFailure) continue;

        const history: TestRunHistory["history"] = sortedExecs
          .filter((ex) => meta.byExec.has(ex.issue_id))
          .map((ex) => ({
            executionKey: ex.jira.key,
            executionIssueId: ex.issue_id,
            statusName: meta.byExec.get(ex.issue_id)!,
          }));

        failedTests.push({
          testIssueId,
          testKey: meta.testKey,
          testSummary: meta.testSummary,
          history,
          classification: classifyHistory(history),
          linkedBugKeys: testKeyToBugKeys.get(meta.testKey) ?? [],
        });
      }

      // Sort: still failing first, then flaky, then fixed, then never-passed
      const ORDER: Record<TestRunHistory["classification"], number> = {
        failing: 0,
        flaky: 1,
        "never-passed": 2,
        fixed: 3,
      };
      failedTests.sort((a, b) => ORDER[a.classification] - ORDER[b.classification]);
    }

    return { counts, total, pagesLoaded, pagesExpected, failedTests };
  }, [executions, extraPageQueries, phase1, phase2, bugs]);
}

// ── Execution run summary ─────────────────────────────────────────────────────

export interface ExecSummary {
  counts: Record<string, number>;
  total: number;
  hasMore: boolean;
  isLoading: boolean;
}

/**
 * Fetches the first page of test runs for a single execution and aggregates
 * status counts. Used to render a mini progress bar on the ExecRow card.
 */
export function useExecutionRunSummary(executionIssueId: string | null): ExecSummary {
  const { data, isLoading } = useQuery<TestRunsPage>({
    queryKey: queryKeys.execSummary(executionIssueId ?? ""),
    queryFn: () => api.getTestRuns(executionIssueId!, STATS_PAGE_SIZE, 0),
    enabled: !!executionIssueId,
    staleTime: 5 * 60 * 1_000,
    gcTime: Infinity,
    meta: { persist: true },
  });

  return useMemo(() => {
    if (!data) return { counts: {}, total: 0, hasMore: false, isLoading };
    const c: Record<string, number> = {};
    for (const run of data.results) {
      const k = run.status.name.toUpperCase();
      c[k] = (c[k] ?? 0) + 1;
    }
    return { counts: c, total: data.total, hasMore: data.results.length < data.total, isLoading };
  }, [data, isLoading]);
}
