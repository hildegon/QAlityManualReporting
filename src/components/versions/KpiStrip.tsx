import { Activity, XCircle, Bug, Layers, BarChart3 } from "lucide-react";
import type { useVersionRunStats } from "@/services/queries";
import { CRITICAL_PRIORITIES } from "@/constants/statuses";
import { cn } from "@/components/ui/utils";
import type { JiraBug, TestExecution } from "@/types";

// ── KpiTile ────────────────────────────────────────────────────────────────────

interface KpiTileProps {
  label: string;
  value: string | number;
  subValue?: string;
  icon: React.ComponentType<{ className?: string }>;
  colorScheme: "emerald" | "red" | "amber" | "slate" | "blue";
  onClick?: () => void;
}

function KpiTile({ label, value, subValue, icon: Icon, colorScheme, onClick }: KpiTileProps) {
  const schemes = {
    emerald: {
      border: "border-emerald-200 dark:border-emerald-800",
      bg: "bg-emerald-50 dark:bg-emerald-950/40",
      icon: "text-emerald-500",
      label: "text-emerald-600 dark:text-emerald-400",
      value: "text-emerald-800 dark:text-emerald-200",
      sub: "text-emerald-500 dark:text-emerald-400",
    },
    red: {
      border: "border-red-200 dark:border-red-800",
      bg: "bg-red-50 dark:bg-red-950/40",
      icon: "text-red-500",
      label: "text-red-600 dark:text-red-400",
      value: "text-red-800 dark:text-red-200",
      sub: "text-red-500 dark:text-red-400",
    },
    amber: {
      border: "border-amber-200 dark:border-amber-800",
      bg: "bg-amber-50 dark:bg-amber-950/40",
      icon: "text-amber-500",
      label: "text-amber-600 dark:text-amber-400",
      value: "text-amber-800 dark:text-amber-200",
      sub: "text-amber-500 dark:text-amber-400",
    },
    slate: {
      border: "border-slate-200 dark:border-slate-700",
      bg: "bg-slate-50 dark:bg-slate-800",
      icon: "text-slate-400",
      label: "text-slate-500 dark:text-slate-400",
      value: "text-slate-800 dark:text-slate-200",
      sub: "text-slate-400 dark:text-slate-500",
    },
    blue: {
      border: "border-blue-200 dark:border-blue-800",
      bg: "bg-blue-50 dark:bg-blue-950/40",
      icon: "text-blue-500",
      label: "text-blue-600 dark:text-blue-400",
      value: "text-blue-800 dark:text-blue-200",
      sub: "text-blue-500 dark:text-blue-400",
    },
  };

  const s = schemes[colorScheme];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "flex flex-1 flex-col gap-1 rounded-xl border px-4 py-3 shadow-sm text-left",
        s.border,
        s.bg,
        onClick &&
          "cursor-pointer transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-current",
        !onClick && "cursor-default",
      )}
    >
      <div className="flex items-center gap-1.5">
        <Icon className={cn("h-3.5 w-3.5 shrink-0", s.icon)} />
        <span className={cn("text-xs font-semibold uppercase tracking-wider", s.label)}>
          {label}
        </span>
      </div>
      <p className={cn("text-2xl font-bold leading-none", s.value)}>{value}</p>
      {subValue && <p className={cn("text-xs", s.sub)}>{subValue}</p>}
    </button>
  );
}

// ── VersionKpiStrip ────────────────────────────────────────────────────────────

interface VersionKpiStripProps {
  stats: ReturnType<typeof useVersionRunStats>;
  executions: TestExecution[];
  bugs: JiraBug[];
  versionIssues: JiraBug[];
}

export function VersionKpiStrip({ stats, executions, bugs, versionIssues }: VersionKpiStripProps) {
  const isLoading = stats.pagesLoaded < stats.pagesExpected;

  const passCount = stats.counts["PASS"] ?? stats.counts["PASSED"] ?? 0;
  const passRate = stats.total > 0 ? Math.round((passCount / stats.total) * 100) : null;
  const passScheme: KpiTileProps["colorScheme"] =
    passRate === null ? "slate" : passRate === 100 ? "emerald" : passRate >= 80 ? "blue" : "amber";

  const failCount =
    (stats.counts["FAIL"] ?? stats.counts["FAILED"] ?? 0) + (stats.counts["BLOCKED"] ?? 0);
  const failScheme: KpiTileProps["colorScheme"] = failCount === 0 ? "emerald" : "red";

  const criticalBugCount = bugs.filter(
    (b) =>
      b.fields.status?.category?.key !== "done" &&
      CRITICAL_PRIORITIES.has(b.fields.priority?.name?.toLowerCase() ?? ""),
  ).length;
  const criticalScheme: KpiTileProps["colorScheme"] = criticalBugCount === 0 ? "emerald" : "red";

  const storiesTotal = versionIssues.length;
  const storiesDone = versionIssues.filter(
    (i) =>
      i.fields.status?.category?.key === "done" || /acceptance/i.test(i.fields.status?.name ?? ""),
  ).length;
  const storiesScheme: KpiTileProps["colorScheme"] =
    storiesTotal === 0
      ? "slate"
      : storiesDone === storiesTotal
        ? "emerald"
        : storiesDone / storiesTotal >= 0.75
          ? "blue"
          : "amber";

  function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="flex flex-wrap gap-3">
      <KpiTile
        label="Pass rate"
        value={isLoading ? "…" : passRate === null ? "—" : `${passRate}%`}
        subValue={isLoading ? "Loading…" : `${passCount} / ${stats.total} tests`}
        icon={Activity}
        colorScheme={isLoading ? "slate" : passScheme}
        onClick={() => scrollToSection("version-section-results")}
      />
      <KpiTile
        label="Failures & blocked"
        value={isLoading ? "…" : failCount}
        subValue={failCount === 0 ? "All clear" : `test runs failing`}
        icon={XCircle}
        colorScheme={isLoading ? "slate" : failScheme}
        onClick={() => scrollToSection("version-section-failures")}
      />
      <KpiTile
        label="Critical bugs"
        value={criticalBugCount}
        subValue={criticalBugCount === 0 ? "No open blockers" : "Unresolved critical/blocker"}
        icon={Bug}
        colorScheme={criticalScheme}
        onClick={() => scrollToSection("version-section-bugs")}
      />
      <KpiTile
        label="Stories progress"
        value={storiesTotal === 0 ? "—" : `${storiesDone} / ${storiesTotal}`}
        subValue={storiesTotal === 0 ? "No issues linked" : "Done or in acceptance"}
        icon={Layers}
        colorScheme={storiesScheme}
        onClick={() => scrollToSection("version-section-issues")}
      />
      <KpiTile
        label="Executions"
        value={executions.length}
        subValue={executions.length === 0 ? "None linked to version" : "Linked to this version"}
        icon={BarChart3}
        colorScheme="slate"
        onClick={() => scrollToSection("version-section-executions")}
      />
    </div>
  );
}
