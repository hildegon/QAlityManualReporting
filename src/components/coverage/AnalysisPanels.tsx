import { useMemo } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  BarChart3,
  Eye,
  Flame,
} from "lucide-react";
import { cn } from "@/components/ui/utils";
import type { XrayTestSet, XrayTestWithStatus } from "@/types";
import { findSlice } from "@/components/charts/status-utils";
import { type SetQueryMap, passRate, hasFail } from "./utils";

// ── Shared sub-components ────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent: "emerald" | "red" | "amber" | "blue" | "slate";
}) {
  const border = {
    emerald: "border-emerald-200 dark:border-emerald-800",
    red: "border-red-200 dark:border-red-800",
    amber: "border-amber-200 dark:border-amber-800",
    blue: "border-blue-200 dark:border-blue-800",
    slate: "border-slate-200 dark:border-slate-700",
  }[accent];
  const bg = {
    emerald: "bg-emerald-50 dark:bg-emerald-950/40",
    red: "bg-red-50 dark:bg-red-950/40",
    amber: "bg-amber-50 dark:bg-amber-950/40",
    blue: "bg-blue-50 dark:bg-blue-950/40",
    slate: "bg-slate-50/70 dark:bg-slate-900/40",
  }[accent];
  const valColor = {
    emerald: "text-emerald-700 dark:text-emerald-300",
    red: "text-red-700 dark:text-red-300",
    amber: "text-amber-700 dark:text-amber-300",
    blue: "text-blue-700 dark:text-blue-300",
    slate: "text-slate-900 dark:text-slate-50",
  }[accent];

  return (
    <div className={cn("rounded-xl border p-3", border, bg)}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className={cn("mt-1 text-2xl font-bold tabular-nums leading-none", valColor)}>
        {value}
      </p>
      {sub && (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{sub}</p>
      )}
    </div>
  );
}

type FindingType = "critical" | "warn" | "ok" | "info";

function FindingCard({
  type,
  text,
}: {
  type: FindingType;
  text: string;
}) {
  const styles = {
    critical: {
      border: "border-red-200 dark:border-red-800/60",
      bg: "bg-red-50/60 dark:bg-red-950/20",
      icon: <Flame className="h-3.5 w-3.5 text-red-500" />,
      textCls: "text-red-800 dark:text-red-200",
    },
    warn: {
      border: "border-amber-200 dark:border-amber-800/60",
      bg: "bg-amber-50/60 dark:bg-amber-950/20",
      icon: <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />,
      textCls: "text-amber-800 dark:text-amber-200",
    },
    ok: {
      border: "border-emerald-200 dark:border-emerald-800/60",
      bg: "bg-emerald-50/60 dark:bg-emerald-950/20",
      icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />,
      textCls: "text-emerald-800 dark:text-emerald-200",
    },
    info: {
      border: "border-blue-200 dark:border-blue-800/60",
      bg: "bg-blue-50/60 dark:bg-blue-950/20",
      icon: <Eye className="h-3.5 w-3.5 text-blue-400" />,
      textCls: "text-blue-800 dark:text-blue-200",
    },
  }[type];

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-xl border px-3 py-2.5",
        styles.border,
        styles.bg,
      )}
    >
      <span className="mt-0.5 shrink-0">{styles.icon}</span>
      <p className={cn("text-xs leading-relaxed", styles.textCls)}>{text}</p>
    </div>
  );
}

function SetProgressBar({
  label,
  subLabel,
  count,
  total,
  maxCount,
  barColor,
  countColor,
}: {
  label: string;
  subLabel: string;
  count: number;
  total: number;
  maxCount: number;
  barColor: string;
  countColor: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const barWidth = maxCount > 0 ? (count / maxCount) * 100 : 0;

  return (
    <div className="group rounded-xl border border-slate-100 bg-white px-3.5 py-2.5 transition-colors hover:border-slate-200 dark:border-slate-700/60 dark:bg-slate-800/40 dark:hover:border-slate-600">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-slate-700 dark:text-slate-200">
            {label}
          </p>
          <p className="font-mono text-[10px] text-slate-400">{subLabel}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className={cn("text-sm font-bold tabular-nums", countColor)}>
            {count}
          </p>
          <p className="text-[10px] text-slate-400">
            {pct}% of {total}
          </p>
        </div>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700/60">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-700 ease-out",
            barColor,
          )}
          style={{ width: `${barWidth}%` }}
        />
      </div>
    </div>
  );
}

// ── Insights Panel ───────────────────────────────────────────────────────────

export function InsightsPanel({
  allTests,
  selectedSets,
  queryBySetId,
}: {
  allTests: XrayTestWithStatus[];
  selectedSets: XrayTestSet[];
  queryBySetId: SetQueryMap;
}) {
  const { kpis, findings } = useMemo(() => {
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

    const items: { type: FindingType; text: string }[] = [];

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
    if (neverRun.length > 0) {
      items.push({
        type: "info",
        text: `${neverRun.length} test${neverRun.length !== 1 ? "s" : ""} never executed (${100 - coveragePct}% gap) across ${setsWithNeverRun} set${setsWithNeverRun !== 1 ? "s" : ""}`,
      });
    }
    if (uncoveredSets.length > 0) {
      items.push({
        type: "critical",
        text: `${uncoveredSets.length} set${uncoveredSets.length !== 1 ? "s have" : " has"} 0% coverage: ${uncoveredSets.map((ts) => ts.jira.summary).join(", ")}`,
      });
    }
    if (fullyPassingSets.length > 0) {
      items.push({
        type: "ok",
        text: `${fullyPassingSets.length} of ${selectedSets.length} set${fullyPassingSets.length !== 1 ? "s are" : " is"} fully passing`,
      });
    }
    if (coveragePct === 100) {
      items.push({ type: "ok", text: "All tests have been run at least once — full coverage" });
    }

    return {
      kpis: {
        total,
        coveragePct,
        passRatePct,
        passed: passedTests.length,
        failed: failingTests.length,
        blocked: blockedTests.length,
        neverRun: neverRun.length,
      },
      findings: items,
    };
  }, [allTests, selectedSets, queryBySetId]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-3 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
        <Activity className="h-3.5 w-3.5" />
        Insights
      </div>

      {/* KPI tiles */}
      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          label="Coverage"
          value={`${kpis.coveragePct}%`}
          sub={`${kpis.total - kpis.neverRun} of ${kpis.total} run`}
          accent={kpis.coveragePct === 100 ? "emerald" : kpis.coveragePct >= 70 ? "blue" : "amber"}
        />
        <KpiCard
          label="Pass Rate"
          value={`${kpis.passRatePct}%`}
          sub={`${kpis.passed} passed`}
          accent={kpis.passRatePct >= 90 ? "emerald" : kpis.passRatePct >= 60 ? "amber" : "red"}
        />
        <KpiCard
          label="Failures"
          value={kpis.failed}
          sub={kpis.failed > 0 ? `${Math.round((kpis.failed / kpis.total) * 100)}% of tests` : "None"}
          accent={kpis.failed === 0 ? "emerald" : kpis.failed <= 3 ? "amber" : "red"}
        />
        <KpiCard
          label="Not Run"
          value={kpis.neverRun}
          sub={kpis.neverRun > 0 ? `${Math.round((kpis.neverRun / kpis.total) * 100)}% untested` : "All executed"}
          accent={kpis.neverRun === 0 ? "emerald" : kpis.neverRun <= 5 ? "amber" : "slate"}
        />
      </div>

      {/* Findings */}
      {findings.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              Findings
            </p>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-slate-500 dark:bg-slate-700 dark:text-slate-400">
              {findings.length}
            </span>
          </div>
          <div className="space-y-1.5">
            {findings.map((item, i) => (
              <FindingCard key={i} type={item.type} text={item.text} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Stacked bar chart ─────────────────────────────────────────────────────────

function StackedBar({
  items,
  accentShade,
}: {
  items: { value: number; label: string }[];
  accentShade: "red" | "amber";
}) {
  const total = items.reduce((s, it) => s + it.value, 0);
  if (total === 0) return null;

  // Show top 3 as labels, rest grouped
  const top3 = items.slice(0, 3);
  const rest = items.slice(3);
  const restSum = rest.reduce((s, it) => s + it.value, 0);

  const shades = accentShade === "red"
    ? ["bg-red-600", "bg-red-400", "bg-red-300", "bg-red-200"]
    : ["bg-amber-500", "bg-amber-400", "bg-amber-300", "bg-amber-200"];

  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 dark:border-slate-700/50 dark:bg-slate-800/40">
      {/* Stacked bar */}
      <div className="mb-2 flex h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700/60">
        {items.map((it, i) => (
          <div
            key={i}
            className={cn("h-full transition-all duration-500", shades[Math.min(i, shades.length - 1)])}
            style={{ width: `${(it.value / total) * 100}%` }}
            title={`${it.label}: ${it.value}`}
          />
        ))}
      </div>
      {/* Labels for top items */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5">
        {top3.map((it, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className={cn("inline-block h-2 w-2 rounded-full", shades[i])} />
            <span className="max-w-[140px] truncate text-[10px] text-slate-500 dark:text-slate-400">
              {it.label}
            </span>
            <span className="text-[10px] font-bold tabular-nums text-slate-600 dark:text-slate-300">
              {it.value}
            </span>
          </div>
        ))}
        {restSum > 0 && (
          <div className="flex items-center gap-1.5">
            <span className={cn("inline-block h-2 w-2 rounded-full", shades[shades.length - 1])} />
            <span className="text-[10px] text-slate-500 dark:text-slate-400">
              +{rest.length} more
            </span>
            <span className="text-[10px] font-bold tabular-nums text-slate-600 dark:text-slate-300">
              {restSum}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Failure Concentration Panel ──────────────────────────────────────────────

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
  const totalFails = ranked.reduce((s, r) => s + r.failCount, 0);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-3 flex items-center gap-1.5">
        <ShieldAlert className="h-3.5 w-3.5 text-red-500" />
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
          Failure Concentration
        </p>
        <span className="ml-auto rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-red-600 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400">
          {totalFails} failure{totalFails !== 1 ? "s" : ""} · {ranked.length} set{ranked.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Chart summary */}
      <div className="mb-3">
        <StackedBar
          items={ranked.map((r) => ({ value: r.failCount, label: r.ts.jira.summary }))}
          accentShade="red"
        />
      </div>

      {/* Detailed bars */}
      <div className="max-h-64 space-y-2 overflow-y-auto">
        {ranked.map(({ ts, failCount, total }) => (
          <SetProgressBar
            key={ts.issue_id}
            label={ts.jira.summary}
            subLabel={ts.jira.key}
            count={failCount}
            total={total}
            maxCount={maxFails}
            barColor="bg-gradient-to-r from-red-400 to-red-500"
            countColor="text-red-600 dark:text-red-400"
          />
        ))}
      </div>
    </div>
  );
}

// ── Never-Run Panel ──────────────────────────────────────────────────────────

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
  const totalNever = ranked.reduce((s, r) => s + r.neverRun, 0);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-3 flex items-center gap-1.5">
        <BarChart3 className="h-3.5 w-3.5 text-amber-500" />
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
          Never-Run Tests
        </p>
        <span className="ml-auto rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-amber-600 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
          {totalNever} test{totalNever !== 1 ? "s" : ""} · {ranked.length} set{ranked.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Chart summary */}
      <div className="mb-3">
        <StackedBar
          items={ranked.map((r) => ({ value: r.neverRun, label: r.ts.jira.summary }))}
          accentShade="amber"
        />
      </div>

      {/* Detailed bars */}
      <div className="max-h-64 space-y-2 overflow-y-auto">
        {ranked.map(({ ts, neverRun, total }) => (
          <SetProgressBar
            key={ts.issue_id}
            label={ts.jira.summary}
            subLabel={ts.jira.key}
            count={neverRun}
            total={total}
            maxCount={maxNever}
            barColor="bg-gradient-to-r from-amber-300 to-amber-400"
            countColor="text-amber-600 dark:text-amber-400"
          />
        ))}
      </div>
    </div>
  );
}
