import { useState, useMemo } from "react";
import {
  Tag,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Clock,
  Circle,
  FileText,
  Loader2,
  AlertTriangle,
  CheckCheck,
  Shuffle,
  TrendingDown,
} from "lucide-react";
import {
  useProjectVersions,
  useTestExecutionsByVersion,
  useVersionRunStats,
} from "@/services/queries";
import { useExecutionProjectKey } from "@/hooks/useProjectKey";
import { parseRateLimitError } from "@/stores/uiStore";
import { Spinner } from "@/components/ui/spinner";
import { Badge, statusVariant } from "@/components/ui/badge";
import { cn } from "@/components/ui/utils";
import { TestExecutionDetail } from "@/components/test-execution/TestExecutionDetail";
import type { JiraVersion, TestExecution } from "@/types";
import type { RunStats, TestRunHistory } from "@/services/queries";

// ── Status palette ────────────────────────────────────────────────────────────

interface StatusSlice {
  key: string;
  label: string;
  color: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
  lightBg: string;
  icon: React.ComponentType<{ className?: string }>;
}

const STATUS_PALETTE: StatusSlice[] = [
  {
    key: "PASS",
    label: "Passed",
    color: "#10b981",
    bgClass: "bg-emerald-500",
    textClass: "text-emerald-600",
    borderClass: "border-emerald-200",
    lightBg: "bg-emerald-50",
    icon: CheckCircle2,
  },
  {
    key: "FAIL",
    label: "Failed",
    color: "#ef4444",
    bgClass: "bg-red-500",
    textClass: "text-red-600",
    borderClass: "border-red-200",
    lightBg: "bg-red-50",
    icon: XCircle,
  },
  {
    key: "BLOCKED",
    label: "Blocked",
    color: "#f59e0b",
    bgClass: "bg-amber-400",
    textClass: "text-amber-600",
    borderClass: "border-amber-200",
    lightBg: "bg-amber-50",
    icon: MinusCircle,
  },
  {
    key: "EXECUTING",
    label: "Executing",
    color: "#3b82f6",
    bgClass: "bg-blue-500",
    textClass: "text-blue-600",
    borderClass: "border-blue-200",
    lightBg: "bg-blue-50",
    icon: Clock,
  },
  {
    key: "TODO",
    label: "To Do",
    color: "#94a3b8",
    bgClass: "bg-slate-300",
    textClass: "text-slate-500",
    borderClass: "border-slate-200",
    lightBg: "bg-slate-50",
    icon: Circle,
  },
];

function findSlice(rawName: string): StatusSlice {
  const upper = rawName.toUpperCase();
  const exact = STATUS_PALETTE.find((s) => s.key === upper);
  if (exact) return exact;
  if (upper.startsWith("PASS")) return STATUS_PALETTE[0]!;
  if (upper.startsWith("FAIL")) return STATUS_PALETTE[1]!;
  return {
    key: upper,
    label: rawName,
    color: "#64748b",
    bgClass: "bg-slate-400",
    textClass: "text-slate-600",
    borderClass: "border-slate-200",
    lightBg: "bg-slate-50",
    icon: Circle,
  };
}

interface Slice extends StatusSlice {
  count: number;
  pct: number;
}

function buildSlices(stats: RunStats): Slice[] {
  const { counts, total } = stats;
  if (total === 0) return [];

  const merged: Record<string, number> = {};
  for (const [k, v] of Object.entries(counts)) {
    const slice = findSlice(k);
    merged[slice.key] = (merged[slice.key] ?? 0) + v;
  }

  const knownOrder = STATUS_PALETTE.map((s) => s.key);
  const allKeys = [
    ...knownOrder.filter((k) => merged[k]),
    ...Object.keys(merged)
      .filter((k) => !knownOrder.includes(k) && merged[k])
      .sort(),
  ];

  return allKeys.map((k) => {
    const count = merged[k] ?? 0;
    return { ...findSlice(k), count, pct: total > 0 ? count / total : 0 };
  });
}

// ── SVG Donut chart ───────────────────────────────────────────────────────────

const DONUT_SIZE = 148;
const R = 54;
const HOLE_R = 36;
const CX = DONUT_SIZE / 2;
const CY = DONUT_SIZE / 2;
const CIRCUMFERENCE = 2 * Math.PI * R;
const GAP = 1.5;

function DonutChart({
  slices,
  total,
  isLoading,
}: {
  slices: Slice[];
  total: number;
  isLoading: boolean;
}) {
  let cumPct = 0;
  return (
    <div className="shrink-0">
      <svg width={DONUT_SIZE} height={DONUT_SIZE} viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`}>
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="#e2e8f0" strokeWidth={R - HOLE_R} />
        {slices.map((sl) => {
          const dashLen = Math.max(0, sl.pct * CIRCUMFERENCE - GAP);
          const offset = -cumPct * CIRCUMFERENCE;
          cumPct += sl.pct;
          return (
            <circle
              key={sl.key}
              cx={CX}
              cy={CY}
              r={R}
              fill="none"
              stroke={sl.color}
              strokeWidth={R - HOLE_R}
              strokeDasharray={`${dashLen} ${CIRCUMFERENCE}`}
              strokeDashoffset={offset}
              style={{ transform: "rotate(-90deg)", transformOrigin: `${CX}px ${CY}px` }}
            >
              <title>{`${sl.label}: ${sl.count} (${Math.round(sl.pct * 100)}%)`}</title>
            </circle>
          );
        })}
        {isLoading ? (
          <circle
            cx={CX}
            cy={CY - 2}
            r={10}
            fill="none"
            stroke="#cbd5e1"
            strokeWidth={2}
            strokeDasharray="32 10"
            style={{
              transformOrigin: `${CX}px ${CY - 2}px`,
              animation: "spin 1s linear infinite",
            }}
          />
        ) : (
          <>
            <text
              x={CX}
              y={CY - 7}
              textAnchor="middle"
              style={{ fontSize: 24, fontWeight: 700, fill: "#1e293b" }}
            >
              {total}
            </text>
            <text
              x={CX}
              y={CY + 12}
              textAnchor="middle"
              style={{ fontSize: 10, fill: "#94a3b8", fontWeight: 500 }}
            >
              test runs
            </text>
          </>
        )}
      </svg>
    </div>
  );
}

// ── Stat cards ────────────────────────────────────────────────────────────────

function StatCard({ sl }: { sl: Slice }) {
  const Icon = sl.icon;
  return (
    <div className={cn("rounded-xl border p-3", sl.lightBg, sl.borderClass)}>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">{sl.label}</span>
        <Icon className={cn("h-3.5 w-3.5", sl.textClass)} />
      </div>
      <p className={cn("text-2xl font-bold", sl.textClass)}>{sl.count}</p>
      <p className="mt-0.5 text-xs text-slate-400">{Math.round(sl.pct * 100)}%</p>
    </div>
  );
}

// ── Stacked bar ───────────────────────────────────────────────────────────────

function StackedBar({ slices }: { slices: Slice[] }) {
  return (
    <div className="space-y-2">
      <div className="flex h-4 w-full overflow-hidden rounded-full bg-slate-100">
        {slices.map((sl) => (
          <div
            key={sl.key}
            className={cn("transition-all duration-500", sl.bgClass)}
            style={{ width: `${sl.pct * 100}%` }}
            title={`${sl.label}: ${sl.count} (${Math.round(sl.pct * 100)}%)`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {slices.map((sl) => (
          <div key={sl.key} className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className={cn("h-2 w-2 shrink-0 rounded-full", sl.bgClass)} />
            {sl.label} — {sl.count} ({Math.round(sl.pct * 100)}%)
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Fetch progress ────────────────────────────────────────────────────────────

function FetchProgress({ loaded, expected }: { loaded: number; expected: number }) {
  if (expected === 0 || loaded >= expected) return null;
  const pct = expected > 0 ? (loaded / expected) * 100 : 0;
  return (
    <div className="flex items-center gap-2 text-xs text-slate-400">
      <Loader2 className="h-3 w-3 animate-spin" />
      <span>
        Loading test results… {loaded}/{expected} pages
      </span>
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-slate-300 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Failed test history row ───────────────────────────────────────────────────

const CLASSIFICATION_META: Record<
  TestRunHistory["classification"],
  { label: string; icon: React.ComponentType<{ className?: string }>; chipClass: string }
> = {
  fixed: {
    label: "Fixed",
    icon: CheckCheck,
    chipClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  failing: {
    label: "Still failing",
    icon: TrendingDown,
    chipClass: "bg-red-50 text-red-700 border-red-200",
  },
  flaky: {
    label: "Flaky",
    icon: Shuffle,
    chipClass: "bg-amber-50 text-amber-700 border-amber-200",
  },
  "never-passed": {
    label: "No pass yet",
    icon: AlertTriangle,
    chipClass: "bg-orange-50 text-orange-700 border-orange-200",
  },
};

function StatusPip({ statusName }: { statusName: string }) {
  const sl = findSlice(statusName);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-1.5 py-0.5 text-xs font-medium",
        sl.lightBg,
        sl.borderClass,
        sl.textClass,
      )}
      title={statusName}
    >
      {statusName}
    </span>
  );
}

function FailedTestRow({ test }: { test: TestRunHistory }) {
  const meta = CLASSIFICATION_META[test.classification];
  const Icon = meta.icon;

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        {/* Test identity */}
        <div className="min-w-0">
          <p className="truncate font-medium text-sm text-slate-900">{test.testSummary}</p>
          <p className="mt-0.5 font-mono text-xs text-slate-400">{test.testKey}</p>
        </div>
        {/* Classification chip */}
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
            meta.chipClass,
          )}
        >
          <Icon className="h-3 w-3" />
          {meta.label}
        </span>
      </div>

      {/* History timeline */}
      {test.history.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-400">History:</span>
          {test.history.map((entry, idx) => (
            <span key={entry.executionKey} className="flex items-center gap-1">
              <span className="font-mono text-xs text-slate-400">{entry.executionKey}</span>
              <StatusPip statusName={entry.statusName} />
              {idx < test.history.length - 1 && <span className="text-slate-300">→</span>}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Failed tests analysis section ─────────────────────────────────────────────

function FailedTestsAnalysis({
  failedTests,
  isLoading,
}: {
  failedTests: TestRunHistory[];
  isLoading: boolean;
}) {
  const [showAll, setShowAll] = useState(false);

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-slate-400" />
          <h3 className="font-semibold text-slate-800">Failed tests analysis</h3>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Waiting for all pages to load…
        </div>
      </div>
    );
  }

  if (failedTests.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <p className="font-semibold text-emerald-800">No failures detected</p>
        </div>
        <p className="mt-0.5 text-sm text-emerald-700">
          All tests with recorded results passed across all executions.
        </p>
      </div>
    );
  }

  // Summary counts by classification
  const byClass = failedTests.reduce<Record<string, number>>((acc, t) => {
    acc[t.classification] = (acc[t.classification] ?? 0) + 1;
    return acc;
  }, {});

  const PREVIEW_COUNT = 5;
  const visible = showAll ? failedTests : failedTests.slice(0, PREVIEW_COUNT);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <h3 className="font-semibold text-slate-800">Failed tests analysis</h3>
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
            {failedTests.length} test{failedTests.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Classification summary pills */}
        <div className="flex flex-wrap gap-2">
          {(["failing", "flaky", "never-passed", "fixed"] as const).map((cls) => {
            const count = byClass[cls];
            if (!count) return null;
            const m = CLASSIFICATION_META[cls];
            const Icon = m.icon;
            return (
              <span
                key={cls}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                  m.chipClass,
                )}
              >
                <Icon className="h-3 w-3" />
                {count} {m.label.toLowerCase()}
              </span>
            );
          })}
        </div>
      </div>

      {/* Rows */}
      <div className="space-y-2">
        {visible.map((t) => (
          <FailedTestRow key={t.testIssueId} test={t} />
        ))}
      </div>

      {failedTests.length > PREVIEW_COUNT && (
        <button
          onClick={() => setShowAll((s) => !s)}
          className="mt-3 text-xs font-medium text-slate-500 hover:text-slate-700"
        >
          {showAll ? "Show less" : `Show ${failedTests.length - PREVIEW_COUNT} more…`}
        </button>
      )}
    </div>
  );
}

// ── Version dashboard ─────────────────────────────────────────────────────────

interface VersionDashboardProps {
  executions: TestExecution[];
  version: JiraVersion;
}

function VersionDashboard({ executions, version }: VersionDashboardProps) {
  const stats = useVersionRunStats(executions);
  const slices = useMemo(() => buildSlices(stats), [stats]);

  const isLoading = stats.pagesLoaded < stats.pagesExpected;
  const passedSlice = slices.find((s) => s.key === "PASS");
  const failedSlice = slices.find((s) => s.key === "FAIL");
  const passRate = stats.total > 0 && passedSlice ? passedSlice.pct : null;

  const healthLabel =
    stats.total === 0
      ? "No test runs"
      : passRate === null
        ? "—"
        : passRate === 1
          ? "All passing"
          : `${Math.round(passRate * 100)}% passing`;

  const healthColor =
    stats.total === 0
      ? "text-slate-400 bg-slate-50 border-slate-200"
      : passRate === 1
        ? "text-emerald-600 bg-emerald-50 border-emerald-200"
        : passRate !== null && passRate >= 0.8
          ? "text-blue-600 bg-blue-50 border-blue-200"
          : failedSlice && failedSlice.count > 0
            ? "text-red-600 bg-red-50 border-red-200"
            : "text-slate-500 bg-slate-50 border-slate-200";

  return (
    <div className="space-y-4">
      {/* Results overview card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Test results report
            </p>
            <h2 className="mt-0.5 text-lg font-bold text-slate-900">{version.name}</h2>
            {version.description && (
              <p className="mt-0.5 text-sm text-slate-500">{version.description}</p>
            )}
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-xs font-semibold",
              healthColor,
            )}
          >
            {isLoading ? "Loading…" : healthLabel}
          </span>
        </div>

        {executions.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">
            No executions linked to this version yet.
          </p>
        ) : (
          <div className="space-y-5">
            <FetchProgress loaded={stats.pagesLoaded} expected={stats.pagesExpected} />

            {stats.total > 0 && (
              <>
                <div className="flex flex-wrap items-center gap-5">
                  <DonutChart slices={slices} total={stats.total} isLoading={isLoading} />
                  <div
                    className="grid flex-1 gap-2"
                    style={{
                      gridTemplateColumns: `repeat(${Math.min(slices.length, 3)}, minmax(0, 1fr))`,
                      minWidth: 220,
                    }}
                  >
                    {slices.map((sl) => (
                      <StatCard key={sl.key} sl={sl} />
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium text-slate-400">Result distribution</p>
                  <StackedBar slices={slices} />
                </div>
              </>
            )}

            <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-400">
              {version.release_date && (
                <span>
                  Release date:{" "}
                  <span className="font-medium text-slate-600">{version.release_date}</span>
                </span>
              )}
              <span>
                Executions: <span className="font-medium text-slate-600">{executions.length}</span>
              </span>
              <span>
                Total runs:{" "}
                <span className="font-medium text-slate-600">{isLoading ? "…" : stats.total}</span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Failed tests analysis — only rendered once we have executions */}
      {executions.length > 0 && (
        <FailedTestsAnalysis failedTests={stats.failedTests} isLoading={isLoading} />
      )}
    </div>
  );
}

// ── Version selector ──────────────────────────────────────────────────────────

interface VersionCardProps {
  version: JiraVersion;
  isActive: boolean;
  onClick: () => void;
}

function VersionCard({ version, isActive, onClick }: VersionCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full rounded-lg border px-4 py-3 text-left transition-colors",
        isActive
          ? "border-slate-800 bg-slate-800 text-white"
          : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-medium text-sm">{version.name}</span>
        <div className="flex shrink-0 gap-1.5">
          {version.released && (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                isActive ? "bg-white/20 text-white" : "bg-green-100 text-green-700",
              )}
            >
              Released
            </span>
          )}
          {version.archived && (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500",
              )}
            >
              Archived
            </span>
          )}
        </div>
      </div>
      {version.description && (
        <p className={cn("mt-0.5 truncate text-xs", isActive ? "text-white/70" : "text-slate-500")}>
          {version.description}
        </p>
      )}
      {version.release_date && (
        <p className={cn("mt-0.5 text-xs", isActive ? "text-white/60" : "text-slate-400")}>
          {version.release_date}
        </p>
      )}
    </button>
  );
}

// ── Individual execution row ──────────────────────────────────────────────────

interface ExecutionRowProps {
  execution: TestExecution;
  onClick: () => void;
}

function ExecutionRow({ execution, onClick }: ExecutionRowProps) {
  const statusName = execution.jira.status?.name ?? "";
  return (
    <button
      onClick={onClick}
      className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-sm text-slate-900">{execution.jira.summary}</p>
          <p className="mt-0.5 font-mono text-xs text-slate-400">{execution.jira.key}</p>
        </div>
        {statusName && (
          <Badge variant={statusVariant(statusName)} className="shrink-0">
            {statusName}
          </Badge>
        )}
      </div>
    </button>
  );
}

// ── Execution list + dashboard panel ─────────────────────────────────────────

interface ExecutionListPanelProps {
  projectKey: string;
  version: JiraVersion;
  onSelectExecution: (exec: TestExecution) => void;
}

function ExecutionListPanel({ projectKey, version, onSelectExecution }: ExecutionListPanelProps) {
  const {
    data: executions,
    isLoading,
    isError,
    error,
  } = useTestExecutionsByVersion(projectKey, version.name);

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (isError) {
    const rateLimitUntil = parseRateLimitError(error);
    if (rateLimitUntil !== null) {
      const seconds = Math.max(0, Math.ceil((rateLimitUntil - Date.now()) / 1_000));
      return (
        <div className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">Rate limited by Xray</p>
          <p className="mt-0.5 text-xs">
            Too many requests. Please wait{seconds > 0 ? ` ~${seconds}s` : ""} and try again.
          </p>
        </div>
      );
    }
    return (
      <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
        <p className="mb-1 font-medium">Failed to load test executions</p>
        <pre className="whitespace-pre-wrap break-words font-mono text-xs">{String(error)}</pre>
      </div>
    );
  }

  return (
    <VersionContent
      executions={executions ?? []}
      version={version}
      onSelectExecution={onSelectExecution}
    />
  );
}

interface VersionContentProps {
  executions: TestExecution[];
  version: JiraVersion;
  onSelectExecution: (exec: TestExecution) => void;
}

function VersionContent({ executions, version, onSelectExecution }: VersionContentProps) {
  return (
    <>
      <VersionDashboard executions={executions} version={version} />

      {executions.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <FileText className="h-3.5 w-3.5" />
            Executions
          </div>
          <div className="space-y-2">
            {executions.map((exec) => (
              <ExecutionRow
                key={exec.issue_id}
                execution={exec}
                onClick={() => onSelectExecution(exec)}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ── Empty / unconfigured states ───────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-48 flex-col items-center justify-center gap-3 text-slate-400">
      <Tag className="h-10 w-10 opacity-40" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function VersionsPage() {
  const executionProjectKey = useExecutionProjectKey();
  const {
    data: versions,
    isLoading: versionsLoading,
    isError: versionsError,
    error: versionsErr,
  } = useProjectVersions(executionProjectKey);

  const [selectedVersion, setSelectedVersion] = useState<JiraVersion | null>(null);
  const [selectedExecution, setSelectedExecution] = useState<TestExecution | null>(null);

  const handleBack = () => setSelectedExecution(null);

  const handleSelectVersion = (v: JiraVersion) => {
    setSelectedVersion(v);
    setSelectedExecution(null);
  };

  if (!executionProjectKey) {
    return <EmptyState message="Set an Execution Project Key in Settings to view versions." />;
  }

  if (versionsLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (versionsError) {
    const rateLimitUntil = parseRateLimitError(versionsErr);
    if (rateLimitUntil !== null) {
      const seconds = Math.max(0, Math.ceil((rateLimitUntil - Date.now()) / 1_000));
      return (
        <div className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">Rate limited by Jira</p>
          <p className="mt-0.5 text-xs">
            Too many requests. Please wait{seconds > 0 ? ` ~${seconds}s` : ""} and try again.
          </p>
        </div>
      );
    }
    return (
      <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
        <p className="mb-1 font-medium">Failed to load versions</p>
        <pre className="whitespace-pre-wrap break-words font-mono text-xs">
          {String(versionsErr)}
        </pre>
      </div>
    );
  }

  const activeVersions = (versions ?? []).filter((v) => !v.archived);
  const archivedVersions = (versions ?? []).filter((v) => v.archived);

  if (activeVersions.length === 0 && archivedVersions.length === 0) {
    return <EmptyState message="No versions found for this project." />;
  }

  if (selectedExecution) {
    return <TestExecutionDetail execution={selectedExecution} onBack={handleBack} />;
  }

  return (
    <div className="flex h-full gap-6">
      {/* Sidebar — version list */}
      <div className="w-60 shrink-0 space-y-1 overflow-y-auto">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Versions
        </p>

        {activeVersions.length > 0 && (
          <div className="space-y-1">
            {activeVersions.map((v) => (
              <VersionCard
                key={v.id}
                version={v}
                isActive={selectedVersion?.id === v.id}
                onClick={() => handleSelectVersion(v)}
              />
            ))}
          </div>
        )}

        {archivedVersions.length > 0 && (
          <>
            <p className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wider text-slate-300">
              Archived
            </p>
            <div className="space-y-1">
              {archivedVersions.map((v) => (
                <VersionCard
                  key={v.id}
                  version={v}
                  isActive={selectedVersion?.id === v.id}
                  onClick={() => handleSelectVersion(v)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Main content */}
      <div className="min-w-0 flex-1 overflow-y-auto">
        {!selectedVersion ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-slate-400">
            <Tag className="h-8 w-8 opacity-40" />
            <p className="text-sm">Select a version to view its report.</p>
          </div>
        ) : (
          <ExecutionListPanel
            projectKey={executionProjectKey}
            version={selectedVersion}
            onSelectExecution={setSelectedExecution}
          />
        )}
      </div>
    </div>
  );
}
