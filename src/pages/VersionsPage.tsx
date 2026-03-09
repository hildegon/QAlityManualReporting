import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  Tag,
  FileText,
  Loader2,
  AlertTriangle,
  CheckCheck,
  Shuffle,
  TrendingDown,
  CheckCircle2,
  Bug,
  User,
  Search,
  X,
  Filter,
  RefreshCw,
  Star,
  Link,
} from "lucide-react";
import {
  DonutChart,
  StatCard,
  StackedBar,
  buildSlicesFromCounts,
  findSlice,
} from "@/components/charts/StatusCharts";
import { EmptyState } from "@/components/common/EmptyState";
import {
  useBugsByVersion,
  useIssueLinkTypes,
  useLinkBugToTest,
  useProjectVersions,
  useTestExecutionsByVersion,
  useVersionRunStats,
  queryKeys,
} from "@/services/queries";
import { useQueryClient } from "@tanstack/react-query";
import { useExecutionProjectKey } from "@/hooks/useProjectKey";
import { parseRateLimitError } from "@/stores/uiStore";
import { useVersionsStore } from "@/stores/versionsStore";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge, statusVariant } from "@/components/ui/badge";
import { cn } from "@/components/ui/utils";
import { TestExecutionDetail } from "@/components/test-execution/TestExecutionDetail";
import type { JiraBug, JiraVersion, TestExecution } from "@/types";
import type { TestRunHistory } from "@/services/queries";

// ── Fetch progress ────────────────────────────────────────────────────────────

function FetchProgress({ loaded, expected }: { loaded: number; expected: number }) {
  if (expected === 0 || loaded >= expected) return null;
  const pct = expected > 0 ? (loaded / expected) * 100 : 0;
  return (
    <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
      <Loader2 className="h-3 w-3 animate-spin" />
      <span>
        Loading test results… {loaded}/{expected} pages
      </span>
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
        <div
          className="h-full rounded-full bg-slate-300 transition-all duration-300 dark:bg-slate-500"
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
    chipClass:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800",
  },
  failing: {
    label: "Still failing",
    icon: TrendingDown,
    chipClass:
      "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
  },
  flaky: {
    label: "Flaky",
    icon: Shuffle,
    chipClass:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800",
  },
  "never-passed": {
    label: "No pass yet",
    icon: AlertTriangle,
    chipClass:
      "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-800",
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

interface FailedTestRowProps {
  test: TestRunHistory;
  /** Bugs available for linking (already filtered to this version). */
  linkableBugs: JiraBug[];
  linkTypeName: string;
  projectKey: string;
  versionName: string;
}

function FailedTestRow({
  test,
  linkableBugs,
  linkTypeName,
  projectKey,
  versionName,
}: FailedTestRowProps) {
  const meta = CLASSIFICATION_META[test.classification];
  const Icon = meta.icon;
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const linkBug = useLinkBugToTest();

  // Close picker when clicking outside
  useEffect(() => {
    if (!pickerOpen) return;
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [pickerOpen]);

  // Bugs not already linked to this test
  const unlinkedBugs = linkableBugs.filter((b) => !test.linkedBugKeys.includes(b.key));

  function handleLinkBug(bugKey: string) {
    setPickerOpen(false);
    linkBug.mutate({ bugKey, testKey: test.testKey, linkTypeName, projectKey, versionName });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-2">
        {/* Test identity */}
        <div className="min-w-0">
          <p className="truncate font-medium text-sm text-slate-900 dark:text-slate-200">
            {test.testSummary}
          </p>
          <p className="mt-0.5 font-mono text-xs text-slate-400">{test.testKey}</p>
        </div>
        {/* Right side: classification chip + link-bug button */}
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
              meta.chipClass,
            )}
          >
            <Icon className="h-3 w-3" />
            {meta.label}
          </span>

          {/* Link-bug button — shown whenever there are bugs for this version */}
          {linkableBugs.length > 0 && (
            <div className="relative" ref={pickerRef}>
              <button
                onClick={() => setPickerOpen((o) => !o)}
                disabled={linkBug.isPending}
                title={linkBug.isPending ? "Linking…" : "Link to a bug"}
                className={cn(
                  "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium transition-colors",
                  linkBug.isPending
                    ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-500"
                    : pickerOpen
                      ? "border-slate-400 bg-slate-100 text-slate-700 dark:border-slate-500 dark:bg-slate-700 dark:text-slate-200"
                      : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-slate-500",
                )}
              >
                {linkBug.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Link className="h-3 w-3" />
                )}
                {linkBug.isPending ? "Linking…" : "Link bug"}
              </button>

              {pickerOpen && (
                <div className="absolute right-0 top-full z-20 mt-1 w-64 rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-600 dark:bg-slate-800">
                  {unlinkedBugs.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-slate-400">
                      All bugs for this version are already linked.
                    </p>
                  ) : (
                    <ul className="max-h-52 overflow-y-auto py-1">
                      {unlinkedBugs.map((bug) => (
                        <li key={bug.key}>
                          <button
                            onClick={() => handleLinkBug(bug.key)}
                            className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700"
                          >
                            <span
                              className={cn(
                                "mt-0.5 shrink-0 font-bold leading-none",
                                priorityClass(bug.fields.priority?.name),
                              )}
                            >
                              ●
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-xs font-medium text-slate-800 dark:text-slate-200">
                                {bug.fields.summary}
                              </p>
                              <p className="font-mono text-[10px] text-slate-400">{bug.key}</p>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
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

      {/* Linked bug badges */}
      {test.linkedBugKeys.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Bug className="h-3 w-3 shrink-0 text-slate-400" />
          {test.linkedBugKeys.map((bugKey) => (
            <span
              key={bugKey}
              className="inline-flex items-center rounded border border-red-200 bg-red-50 px-1.5 py-0.5 font-mono text-[10px] font-medium text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
            >
              {bugKey}
            </span>
          ))}
        </div>
      )}

      {/* Link-bug error feedback */}
      {linkBug.isError && (
        <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">
          Failed to link bug: {linkBug.error ?? "Unknown error"}
        </p>
      )}
    </div>
  );
}

// ── Failed tests analysis section ─────────────────────────────────────────────

function FailedTestsAnalysis({
  failedTests,
  isLoading,
  linkableBugs,
  linkTypeName,
  projectKey,
  versionName,
}: {
  failedTests: TestRunHistory[];
  isLoading: boolean;
  linkableBugs: JiraBug[];
  linkTypeName: string;
  projectKey: string;
  versionName: string;
}) {
  const [showAll, setShowAll] = useState(false);

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-slate-400" />
          <h3 className="font-semibold text-slate-800 dark:text-slate-300">
            Failed tests analysis
          </h3>
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
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm dark:border-emerald-800 dark:bg-emerald-950">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <p className="font-semibold text-emerald-800 dark:text-emerald-300">
            No failures detected
          </p>
        </div>
        <p className="mt-0.5 text-sm text-emerald-700 dark:text-emerald-200">
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
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <h3 className="font-semibold text-slate-800 dark:text-slate-200">
            Failed tests analysis
          </h3>
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
          <FailedTestRow
            key={t.testIssueId}
            test={t}
            linkableBugs={linkableBugs}
            linkTypeName={linkTypeName}
            projectKey={projectKey}
            versionName={versionName}
          />
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
  stats: ReturnType<typeof useVersionRunStats>;
  executions: TestExecution[];
  version: JiraVersion;
  projectKey: string;
  bugs: JiraBug[];
}

function VersionDashboard({ stats, executions, version, projectKey, bugs }: VersionDashboardProps) {
  const { data: linkTypes } = useIssueLinkTypes();
  const linkTypeName = useMemo(() => {
    const match = linkTypes?.find((lt) => /test/i.test(lt.name));
    return match?.name ?? "Test";
  }, [linkTypes]);

  const slices = useMemo(() => buildSlicesFromCounts(stats.counts, stats.total), [stats]);

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
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Test results report
            </p>
            <h2 className="mt-0.5 text-lg font-bold text-slate-900 dark:text-slate-100">
              {version.name}
            </h2>
            {version.description && (
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                {version.description}
              </p>
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

            <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-400 dark:border-slate-700 dark:text-slate-500">
              {version.release_date && (
                <span>
                  Release date:{" "}
                  <span className="font-medium text-slate-600 dark:text-slate-300">
                    {version.release_date}
                  </span>
                </span>
              )}
              <span>
                Executions:{" "}
                <span className="font-medium text-slate-600 dark:text-slate-300">
                  {executions.length}
                </span>
              </span>
              <span>
                Total runs:{" "}
                <span className="font-medium text-slate-600 dark:text-slate-300">
                  {isLoading ? "…" : stats.total}
                </span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Failed tests analysis — only rendered once we have executions */}
      {executions.length > 0 && (
        <FailedTestsAnalysis
          failedTests={stats.failedTests}
          isLoading={isLoading}
          linkableBugs={bugs}
          linkTypeName={linkTypeName}
          projectKey={projectKey}
          versionName={version.name}
        />
      )}
    </div>
  );
}

// ── Version selector ──────────────────────────────────────────────────────────

interface VersionCardProps {
  version: JiraVersion;
  isActive: boolean;
  isFavourite: boolean;
  onClick: () => void;
  onToggleFavourite: (e: React.MouseEvent) => void;
}

function VersionCard({
  version,
  isActive,
  isFavourite,
  onClick,
  onToggleFavourite,
}: VersionCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group w-full rounded-lg border px-4 py-3 text-left transition-colors",
        isActive
          ? "border-slate-800 bg-slate-800 text-white"
          : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:bg-slate-700",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-medium text-sm">{version.name}</span>
        <div className="flex shrink-0 items-center gap-1.5">
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
          {/* Favourite star */}
          <span
            role="button"
            aria-label={isFavourite ? "Remove from favourites" : "Add to favourites"}
            onClick={onToggleFavourite}
            className={cn(
              "rounded p-0.5 transition-colors",
              isFavourite
                ? isActive
                  ? "text-amber-300 hover:text-amber-100"
                  : "text-amber-400 hover:text-amber-500"
                : isActive
                  ? "text-white/40 hover:text-white/80"
                  : "text-slate-300 hover:text-amber-400",
            )}
          >
            <Star
              className="h-3.5 w-3.5"
              fill={isFavourite ? "currentColor" : "none"}
              strokeWidth={isFavourite ? 0 : 1.5}
            />
          </span>
        </div>
      </div>
      {version.description && (
        <p
          className={cn(
            "mt-0.5 truncate text-xs",
            isActive ? "text-white/70" : "text-slate-500 dark:text-slate-400",
          )}
        >
          {version.description}
        </p>
      )}
      {version.release_date && (
        <p
          className={cn(
            "mt-0.5 text-xs",
            isActive ? "text-white/60" : "text-slate-400 dark:text-slate-500",
          )}
        >
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
      className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600 dark:hover:bg-slate-700"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-sm text-slate-900 dark:text-slate-200">
            {execution.jira.summary}
          </p>
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
  onReload: () => void;
  isRefreshing: boolean;
}

function ExecutionListPanel({
  projectKey,
  version,
  onSelectExecution,
  onReload,
  isRefreshing,
}: ExecutionListPanelProps) {
  const {
    data: executions,
    isLoading,
    isError,
    error,
  } = useTestExecutionsByVersion(projectKey, version.name);

  if (isLoading) {
    return (
      <div className="space-y-2 p-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded border border-slate-100 px-3 py-2 dark:border-slate-700"
          >
            <Skeleton className="h-4 w-20 shrink-0" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    const rateLimitUntil = parseRateLimitError(error);
    if (rateLimitUntil !== null) {
      const seconds = Math.max(0, Math.ceil((rateLimitUntil - Date.now()) / 1_000));
      return (
        <div className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
          <p className="font-medium">Rate limited by Xray</p>
          <p className="mt-0.5 text-xs">
            Too many requests. Please wait{seconds > 0 ? ` ~${seconds}s` : ""} and try again.
          </p>
        </div>
      );
    }
    return (
      <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
        <p className="mb-1 font-medium">Failed to load test executions</p>
        <pre className="whitespace-pre-wrap break-words font-mono text-xs">{String(error)}</pre>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <button
          onClick={onReload}
          disabled={isRefreshing}
          title="Reload version data"
          className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40 dark:hover:bg-slate-700 dark:text-slate-400"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
          Reload
        </button>
      </div>
      <VersionContent
        projectKey={projectKey}
        executions={executions ?? []}
        version={version}
        onSelectExecution={onSelectExecution}
      />
    </div>
  );
}

// ── Bugs panel ────────────────────────────────────────────────────────────────

/** Colour class for a Jira status category key. */
function statusCategoryClass(categoryKey?: string): string {
  if (categoryKey === "done") return "bg-emerald-100 text-emerald-700";
  if (categoryKey === "indeterminate") return "bg-blue-100 text-blue-700";
  if (categoryKey === "new") return "bg-slate-100 text-slate-500";
  return "bg-slate-100 text-slate-500";
}

/** Colour class for a Jira priority name. */
function priorityClass(priority?: string): string {
  const p = priority?.toLowerCase() ?? "";
  if (p === "highest" || p === "critical") return "text-red-600";
  if (p === "high") return "text-orange-500";
  if (p === "medium") return "text-amber-500";
  if (p === "low") return "text-blue-400";
  return "text-slate-400";
}

/** Toggle-chip used for priority and status multi-select filters. */
function FilterChip({
  label,
  active,
  colorClass,
  onClick,
}: {
  label: string;
  active: boolean;
  colorClass?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
        active
          ? cn("border-slate-700 bg-slate-700 text-white", colorClass && "")
          : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-500",
      )}
    >
      {label}
    </button>
  );
}

const PRIORITY_ORDER = ["Highest", "High", "Medium", "Low", "Lowest"];

interface BugsPanelProps {
  bugs: JiraBug[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  /** Failed test histories for this version — used to show which tests detected each bug. */
  failedTests: TestRunHistory[];
}

function BugsPanel({ bugs, isLoading, isError, error, failedTests }: BugsPanelProps) {
  // ── bug key → detecting test keys (from failed test analysis) ─────────────
  const bugToDetectingTests = useMemo(() => {
    const map = new Map<string, { testKey: string; testSummary: string }[]>();
    for (const test of failedTests) {
      for (const bugKey of test.linkedBugKeys) {
        const existing = map.get(bugKey) ?? [];
        existing.push({ testKey: test.testKey, testSummary: test.testSummary });
        map.set(bugKey, existing);
      }
    }
    return map;
  }, [failedTests]);

  // ── filter state ──────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [activePriorities, setActivePriorities] = useState<Set<string>>(new Set());
  const [activeStatuses, setActiveStatuses] = useState<Set<string>>(new Set());
  const [activeAssignee, setActiveAssignee] = useState<string | null>(null);
  const [unresolvedOnly, setUnresolvedOnly] = useState(false);

  // ── derived option lists (built from loaded data) ─────────────────────────
  const { priorities, statuses, assignees } = useMemo(() => {
    const list = bugs ?? [];
    const pSet = new Set<string>();
    const sSet = new Set<string>();
    const aSet = new Set<string>();
    for (const b of list) {
      if (b.fields.priority?.name) pSet.add(b.fields.priority.name);
      if (b.fields.status?.name) sSet.add(b.fields.status.name);
      if (b.fields.assignee?.display_name) aSet.add(b.fields.assignee.display_name);
    }
    const sortedP = PRIORITY_ORDER.filter((p) => pSet.has(p)).concat(
      [...pSet].filter((p) => !PRIORITY_ORDER.includes(p)).sort(),
    );
    return {
      priorities: sortedP,
      statuses: [...sSet].sort(),
      assignees: [...aSet].sort(),
    };
  }, [bugs]);

  // ── filtered list ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const list = bugs ?? [];
    const q = search.trim().toLowerCase();
    return list.filter((b) => {
      if (q && !b.fields.summary.toLowerCase().includes(q) && !b.key.toLowerCase().includes(q))
        return false;
      if (activePriorities.size > 0 && !activePriorities.has(b.fields.priority?.name ?? ""))
        return false;
      if (activeStatuses.size > 0 && !activeStatuses.has(b.fields.status?.name ?? "")) return false;
      if (activeAssignee !== null) {
        const name = b.fields.assignee?.display_name ?? null;
        if (name !== activeAssignee) return false;
      }
      if (unresolvedOnly && b.fields.status?.category?.key === "done") return false;
      return true;
    });
  }, [bugs, search, activePriorities, activeStatuses, activeAssignee, unresolvedOnly]);

  const hasActiveFilters =
    search.trim() !== "" ||
    activePriorities.size > 0 ||
    activeStatuses.size > 0 ||
    activeAssignee !== null ||
    unresolvedOnly;

  function clearFilters() {
    setSearch("");
    setActivePriorities(new Set());
    setActiveStatuses(new Set());
    setActiveAssignee(null);
    setUnresolvedOnly(false);
  }

  function toggleSet(set: Set<string>, value: string): Set<string> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  // ── render ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex h-16 items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
        Failed to load bugs: {String(error)}
      </div>
    );
  }

  const list = bugs ?? [];

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      {/* Header */}
      <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        <Bug className="h-3.5 w-3.5" />
        Bugs ({list.length})
        {hasActiveFilters && (
          <span className="ml-1 rounded-full bg-slate-700 px-1.5 py-0.5 text-white">
            {filtered.length} shown
          </span>
        )}
      </div>

      {list.length > 0 && (
        <div className="mb-3 space-y-2">
          {/* Text search */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search summary or key…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-8 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-slate-400 focus:bg-white dark:border-slate-700 dark:bg-slate-700 dark:text-slate-200 dark:placeholder-slate-500 dark:focus:border-slate-500 dark:focus:bg-slate-700"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Filter row */}
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-3.5 w-3.5 shrink-0 text-slate-300" />

            {/* Unresolved toggle */}
            <FilterChip
              label="Unresolved"
              active={unresolvedOnly}
              onClick={() => setUnresolvedOnly((v) => !v)}
            />

            {/* Priority chips */}
            {priorities.map((p) => (
              <FilterChip
                key={p}
                label={p}
                active={activePriorities.has(p)}
                onClick={() => setActivePriorities((s) => toggleSet(s, p))}
              />
            ))}

            {/* Status chips */}
            {statuses.map((s) => (
              <FilterChip
                key={s}
                label={s}
                active={activeStatuses.has(s)}
                onClick={() => setActiveStatuses((prev) => toggleSet(prev, s))}
              />
            ))}

            {/* Assignee chips */}
            {assignees.map((a) => (
              <FilterChip
                key={a}
                label={a}
                active={activeAssignee === a}
                onClick={() => setActiveAssignee((prev) => (prev === a ? null : a))}
              />
            ))}

            {/* Clear all */}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="ml-auto text-xs text-slate-400 hover:text-slate-600"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-xs italic text-slate-400">
          {list.length === 0
            ? "No bugs found for this version."
            : "No bugs match the current filters."}
        </p>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((bug: JiraBug) => (
            <div
              key={bug.id}
              className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800"
            >
              {/* Priority dot */}
              <span
                className={cn(
                  "mt-0.5 shrink-0 font-bold leading-none",
                  priorityClass(bug.fields.priority?.name),
                )}
                title={bug.fields.priority?.name ?? "No priority"}
              >
                ●
              </span>

              {/* Key + summary */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-slate-800 dark:text-slate-200">
                  {bug.fields.summary}
                </p>
                <p className="mt-0.5 font-mono text-xs text-slate-400">{bug.key}</p>
                {/* Detecting tests */}
                {(bugToDetectingTests.get(bug.key) ?? []).length > 0 && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    <span className="text-[10px] text-slate-400">Detected by:</span>
                    {bugToDetectingTests.get(bug.key)!.map(({ testKey, testSummary }) => (
                      <span
                        key={testKey}
                        title={testSummary}
                        className="inline-flex items-center rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300"
                      >
                        {testKey}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Assignee */}
              {bug.fields.assignee ? (
                <span className="flex shrink-0 items-center gap-1 text-xs text-slate-400 dark:text-slate-400">
                  <User className="h-3 w-3" />
                  {bug.fields.assignee.display_name}
                </span>
              ) : null}

              {/* Status badge */}
              {bug.fields.status && (
                <span
                  className={cn(
                    "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                    statusCategoryClass(bug.fields.status.category?.key),
                  )}
                >
                  {bug.fields.status.name}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Version content ───────────────────────────────────────────────────────────

interface VersionContentProps {
  projectKey: string;
  executions: TestExecution[];
  version: JiraVersion;
  onSelectExecution: (exec: TestExecution) => void;
}

function VersionContent({
  projectKey,
  executions,
  version,
  onSelectExecution,
}: VersionContentProps) {
  const {
    data: bugs,
    isLoading: bugsLoading,
    isError: bugsError,
    error: bugsErr,
  } = useBugsByVersion(projectKey, version.name);
  const stats = useVersionRunStats(executions, bugs);

  return (
    <>
      <VersionDashboard
        stats={stats}
        executions={executions}
        version={version}
        projectKey={projectKey}
        bugs={bugs ?? []}
      />

      <BugsPanel
        bugs={bugs}
        isLoading={bugsLoading}
        isError={bugsError}
        error={bugsErr}
        failedTests={stats.failedTests}
      />

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

// ── Main page ─────────────────────────────────────────────────────────────────

export function VersionsPage() {
  const executionProjectKey = useExecutionProjectKey();
  const queryClient = useQueryClient();
  const { isFavourite, toggleFavourite } = useVersionsStore();

  const {
    data: versions,
    isLoading: versionsLoading,
    isError: versionsError,
    error: versionsErr,
  } = useProjectVersions(executionProjectKey);

  const [selectedVersion, setSelectedVersion] = useState<JiraVersion | null>(null);
  const [selectedExecution, setSelectedExecution] = useState<TestExecution | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleBack = () => setSelectedExecution(null);

  const handleSelectVersion = (v: JiraVersion) => {
    setSelectedVersion(v);
    setSelectedExecution(null);
  };

  const handleReload = useCallback(async () => {
    if (!executionProjectKey) return;
    setIsRefreshing(true);
    const toInvalidate = [
      queryClient.invalidateQueries({ queryKey: queryKeys.projectVersions(executionProjectKey) }),
      ...(selectedVersion
        ? [
            queryClient.invalidateQueries({
              queryKey: queryKeys.bugsByVersion(executionProjectKey, selectedVersion.name),
            }),
            queryClient.invalidateQueries({
              queryKey: queryKeys.testExecutionsByVersion(
                executionProjectKey,
                selectedVersion.name,
              ),
            }),
          ]
        : []),
    ];
    await Promise.all(toInvalidate);
    setIsRefreshing(false);
  }, [executionProjectKey, selectedVersion, queryClient]);

  if (!executionProjectKey) {
    return (
      <EmptyState icon={Tag} message="Set an Execution Project Key in Settings to view versions." />
    );
  }

  if (versionsLoading) {
    return (
      <div className="space-y-2">
        <div className="mb-4 flex items-center justify-between">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-8 w-20" />
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-slate-100 p-4 space-y-2 dark:border-slate-700"
          >
            <div className="flex items-center gap-3">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-16 rounded-full" />
            </div>
            <Skeleton className="h-3 w-48" />
          </div>
        ))}
      </div>
    );
  }

  if (versionsError) {
    const rateLimitUntil = parseRateLimitError(versionsErr);
    if (rateLimitUntil !== null) {
      const seconds = Math.max(0, Math.ceil((rateLimitUntil - Date.now()) / 1_000));
      return (
        <div className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
          <p className="font-medium">Rate limited by Jira</p>
          <p className="mt-0.5 text-xs">
            Too many requests. Please wait{seconds > 0 ? ` ~${seconds}s` : ""} and try again.
          </p>
        </div>
      );
    }
    return (
      <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
        <p className="mb-1 font-medium">Failed to load versions</p>
        <pre className="whitespace-pre-wrap break-words font-mono text-xs">
          {String(versionsErr)}
        </pre>
      </div>
    );
  }

  const allVersions = versions ?? [];
  const favouriteVersions = allVersions.filter(
    (v) => executionProjectKey && isFavourite(executionProjectKey, v.id),
  );
  const activeVersions = allVersions.filter(
    (v) => !v.archived && !(executionProjectKey && isFavourite(executionProjectKey, v.id)),
  );
  const archivedVersions = allVersions.filter(
    (v) => v.archived && !(executionProjectKey && isFavourite(executionProjectKey, v.id)),
  );

  function handleToggleFavourite(e: React.MouseEvent, version: JiraVersion) {
    e.stopPropagation();
    if (!executionProjectKey) return;
    toggleFavourite(executionProjectKey, version.id);
  }

  if (allVersions.length === 0) {
    return <EmptyState icon={Tag} message="No versions found for this project." />;
  }

  if (selectedExecution) {
    return <TestExecutionDetail execution={selectedExecution} onBack={handleBack} />;
  }

  return (
    <div className="flex h-full gap-6">
      {/* Sidebar — version list */}
      <div className="w-60 shrink-0 space-y-1 overflow-y-auto">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Versions</p>
          <button
            onClick={handleReload}
            disabled={isRefreshing}
            title="Reload versions and data"
            className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40 dark:hover:bg-slate-700 dark:text-slate-400"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
          </button>
        </div>

        {favouriteVersions.length > 0 && (
          <>
            <div className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-amber-400">
              <Star className="h-3 w-3 fill-current" />
              Favourites
            </div>
            <div className="space-y-1">
              {favouriteVersions.map((v) => (
                <VersionCard
                  key={v.id}
                  version={v}
                  isActive={selectedVersion?.id === v.id}
                  isFavourite={true}
                  onClick={() => handleSelectVersion(v)}
                  onToggleFavourite={(e) => handleToggleFavourite(e, v)}
                />
              ))}
            </div>
            {(activeVersions.length > 0 || archivedVersions.length > 0) && (
              <div className="my-2 border-t border-slate-100 dark:border-slate-700" />
            )}
          </>
        )}

        {activeVersions.length > 0 && (
          <div className="space-y-1">
            {activeVersions.map((v) => (
              <VersionCard
                key={v.id}
                version={v}
                isActive={selectedVersion?.id === v.id}
                isFavourite={false}
                onClick={() => handleSelectVersion(v)}
                onToggleFavourite={(e) => handleToggleFavourite(e, v)}
              />
            ))}
          </div>
        )}

        {archivedVersions.length > 0 && (
          <>
            <p className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wider text-slate-300 dark:text-slate-500">
              Archived
            </p>
            <div className="space-y-1">
              {archivedVersions.map((v) => (
                <VersionCard
                  key={v.id}
                  version={v}
                  isActive={selectedVersion?.id === v.id}
                  isFavourite={false}
                  onClick={() => handleSelectVersion(v)}
                  onToggleFavourite={(e) => handleToggleFavourite(e, v)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Main content */}
      <div className="min-w-0 flex-1 overflow-y-auto">
        {!selectedVersion ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-slate-400 dark:text-slate-500">
            <Tag className="h-8 w-8 opacity-40" />
            <p className="text-sm">Select a version to view its report.</p>
          </div>
        ) : (
          <ExecutionListPanel
            projectKey={executionProjectKey}
            version={selectedVersion}
            onSelectExecution={setSelectedExecution}
            onReload={handleReload}
            isRefreshing={isRefreshing}
          />
        )}
      </div>
    </div>
  );
}
