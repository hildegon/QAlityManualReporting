import { useMemo } from "react";
import { Activity, AlertTriangle, CheckSquare2, Clock, XCircle } from "lucide-react";
import type { XrayTestSet, XrayTestWithStatus } from "@/types";
import { findSlice } from "@/components/charts/status-utils";
import { type SetQueryMap, passRate, hasFail } from "./utils";

export function InsightsPanel({
  allTests,
  selectedSets,
  queryBySetId,
}: {
  allTests: XrayTestWithStatus[];
  selectedSets: XrayTestSet[];
  queryBySetId: SetQueryMap;
}) {
  const data = useMemo(() => {
    const total = allTests.length;
    const failingTests = allTests.filter(
      (t) => findSlice(t.latest_status?.name ?? "TODO").key === "FAIL",
    );
    const blockedTests = allTests.filter(
      (t) => findSlice(t.latest_status?.name ?? "TODO").key === "BLOCKED",
    );
    const executingTests = allTests.filter(
      (t) => findSlice(t.latest_status?.name ?? "TODO").key === "EXECUTING",
    );
    const neverRun = allTests.filter((t) => t.latest_status?.is_final !== true);
    const runAtLeastOnce = total - neverRun.length;
    const passedTests = allTests.filter(
      (t) => findSlice(t.latest_status?.name ?? "TODO").key === "PASS",
    );
    const coveragePct = total > 0 ? Math.round((runAtLeastOnce / total) * 100) : 0;
    const passRatePct = total > 0 ? Math.round((passedTests.length / total) * 100) : 0;
    const failRatePct = total > 0 ? Math.round((failingTests.length / total) * 100) : 0;

    const setsWithFails = [...queryBySetId.values()].filter(
      (q) => q.tests && hasFail(q.tests),
    ).length;
    const setsWithNeverRun = [...queryBySetId.values()].filter(
      (q) => q.tests && q.tests.some((t) => t.latest_status?.is_final !== true),
    ).length;
    const uncoveredSets = selectedSets.filter((ts) => {
      const q = queryBySetId.get(ts.issue_id);
      return q?.tests && q.tests.length > 0 && q.tests.every((t) => t.latest_status?.is_final !== true);
    });
    const fullyPassingSets = selectedSets.filter((ts) => {
      const q = queryBySetId.get(ts.issue_id);
      return q?.tests && q.tests.length > 0 && passRate(q.tests) === 1;
    });
    const highFailSets = selectedSets.filter((ts) => {
      const tests = queryBySetId.get(ts.issue_id)?.tests ?? [];
      if (tests.length === 0) return false;
      const fails = tests.filter((t) => findSlice(t.latest_status?.name ?? "TODO").key === "FAIL").length;
      return fails / tests.length >= 0.5;
    });
    const topFailSet = selectedSets
      .map((ts) => {
        const tests = queryBySetId.get(ts.issue_id)?.tests ?? [];
        const fails = tests.filter((t) => findSlice(t.latest_status?.name ?? "TODO").key === "FAIL").length;
        return { ts, fails };
      })
      .filter((r) => r.fails > 0)
      .sort((a, b) => b.fails - a.fails)[0];

    const items: { type: "critical" | "warn" | "ok" | "info"; text: string }[] = [];

    // Summary metrics
    items.push({
      type: "info",
      text: `${coveragePct}% coverage — ${runAtLeastOnce} of ${total} tests run at least once`,
    });
    items.push({
      type: passRatePct === 100 ? "ok" : passRatePct >= 80 ? "info" : passRatePct >= 50 ? "warn" : "critical",
      text: `${passRatePct}% overall pass rate (${passedTests.length} passed, ${failingTests.length} failed)`,
    });

    // Failure findings
    if (failingTests.length > 0) {
      items.push({
        type: "warn",
        text: `${failingTests.length} test${failingTests.length !== 1 ? "s" : ""} failing across ${setsWithFails} set${setsWithFails !== 1 ? "s" : ""} — ${failRatePct}% of total`,
      });
    }
    if (highFailSets.length > 0) {
      items.push({
        type: "critical",
        text: `${highFailSets.length} set${highFailSets.length !== 1 ? "s have" : " has"} >50% failure rate: ${highFailSets.map((ts) => ts.jira.summary).join(", ")}`,
      });
    }
    if (topFailSet) {
      items.push({
        type: "warn",
        text: `Most failures in "${topFailSet.ts.jira.summary}" (${topFailSet.fails} failing)`,
      });
    }

    // Blocked / executing
    if (blockedTests.length > 0) {
      items.push({
        type: "warn",
        text: `${blockedTests.length} test${blockedTests.length !== 1 ? "s are" : " is"} blocked`,
      });
    }
    if (executingTests.length > 0) {
      items.push({
        type: "info",
        text: `${executingTests.length} test${executingTests.length !== 1 ? "s are" : " is"} currently executing`,
      });
    }

    // Coverage gaps
    if (neverRun.length > 0) {
      items.push({
        type: "info",
        text: `${neverRun.length} test${neverRun.length !== 1 ? "s" : ""} never executed (${100 - coveragePct}% coverage gap) across ${setsWithNeverRun} set${setsWithNeverRun !== 1 ? "s" : ""}`,
      });
    }
    if (uncoveredSets.length > 0) {
      items.push({
        type: "warn",
        text: `${uncoveredSets.length} set${uncoveredSets.length !== 1 ? "s have" : " has"} 0% coverage — not a single test has been run: ${uncoveredSets.map((ts) => ts.jira.summary).join(", ")}`,
      });
    }

    // Good news
    if (fullyPassingSets.length > 0) {
      items.push({
        type: "ok",
        text: `${fullyPassingSets.length} of ${selectedSets.length} set${fullyPassingSets.length !== 1 ? "s are" : " is"} fully passing`,
      });
    }
    if (coveragePct === 100) {
      items.push({ type: "ok", text: "All tests have been run at least once — coverage is complete" });
    }

    return items;
  }, [allTests, selectedSets, queryBySetId]);

  if (data.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-4 flex items-center gap-1.5">
        <Activity className="h-3.5 w-3.5 text-slate-400" />
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Insights</p>
      </div>
      <ul className="space-y-2.5">
        {data.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-xs">
            {item.type === "critical" ? (
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
            ) : item.type === "warn" ? (
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
            ) : item.type === "ok" ? (
              <CheckSquare2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
            ) : (
              <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-400" />
            )}
            <span
              className={
                item.type === "critical"
                  ? "text-red-700 dark:text-red-300"
                  : item.type === "warn"
                    ? "text-slate-700 dark:text-slate-200"
                    : item.type === "ok"
                      ? "text-emerald-700 dark:text-emerald-300"
                      : "text-slate-500 dark:text-slate-400"
              }
            >
              {item.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FailureConcentrationPanel({
  selectedSets,
  queryBySetId,
}: {
  selectedSets: XrayTestSet[];
  queryBySetId: SetQueryMap;
}) {
  const ranked = useMemo(() => {
    return selectedSets
      .map((ts) => {
        const tests = queryBySetId.get(ts.issue_id)?.tests ?? [];
        const failCount = tests.filter(
          (t) => findSlice(t.latest_status?.name ?? "TODO").key === "FAIL",
        ).length;
        return { ts, failCount, total: tests.length };
      })
      .filter((r) => r.failCount > 0)
      .sort((a, b) => b.failCount - a.failCount);
  }, [selectedSets, queryBySetId]);

  if (ranked.length === 0) return null;

  const maxFails = ranked[0]!.failCount;

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
      <div className="mb-3 flex items-center gap-1.5">
        <XCircle className="h-3.5 w-3.5 text-red-400" />
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Failure concentration
        </p>
      </div>
      <div className="space-y-3">
        {ranked.map(({ ts, failCount, total }) => {
          const pct = total > 0 ? Math.round((failCount / total) * 100) : 0;
          const barWidth = maxFails > 0 ? (failCount / maxFails) * 100 : 0;
          return (
            <div key={ts.issue_id}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-slate-700 dark:text-slate-200">
                    {ts.jira.summary}
                  </span>
                  <span className="font-mono text-[10px] text-slate-400">{ts.jira.key}</span>
                </div>
                <span className="shrink-0 text-xs font-semibold text-red-600 dark:text-red-400">
                  {failCount} ({pct}%)
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <div
                  className="h-full rounded-full bg-red-400 transition-all duration-500"
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function NeverRunPanel({
  selectedSets,
  queryBySetId,
}: {
  selectedSets: XrayTestSet[];
  queryBySetId: SetQueryMap;
}) {
  const ranked = useMemo(() => {
    return selectedSets
      .map((ts) => {
        const tests = queryBySetId.get(ts.issue_id)?.tests ?? [];
        const neverRun = tests.filter((t) => t.latest_status?.is_final !== true).length;
        return { ts, neverRun, total: tests.length };
      })
      .filter((r) => r.neverRun > 0)
      .sort((a, b) => b.neverRun - a.neverRun);
  }, [selectedSets, queryBySetId]);

  if (ranked.length === 0) return null;

  const maxNever = ranked[0]!.neverRun;

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
      <div className="mb-3 flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5 text-amber-400" />
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Never-run tests
        </p>
      </div>
      <div className="space-y-3">
        {ranked.map(({ ts, neverRun, total }) => {
          const pct = total > 0 ? Math.round((neverRun / total) * 100) : 0;
          const barWidth = maxNever > 0 ? (neverRun / maxNever) * 100 : 0;
          return (
            <div key={ts.issue_id}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-slate-700 dark:text-slate-200">
                    {ts.jira.summary}
                  </span>
                  <span className="font-mono text-[10px] text-slate-400">{ts.jira.key}</span>
                </div>
                <span className="shrink-0 text-xs font-semibold text-amber-600 dark:text-amber-400">
                  {neverRun} ({pct}%)
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <div
                  className="h-full rounded-full bg-amber-400 transition-all duration-500"
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
