import { useState, useMemo, useCallback, useRef, useEffect, memo } from "react";
import { open as openFilePicker } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  Tag,
  FileText,
  Loader2,
  AlertTriangle,
  CheckCheck,
  Shuffle,
  TrendingDown,
  CheckCircle2,
  CheckCircle,
  ChevronDown,
  Clock,
  Bug,
  User,
  Search,
  X,
  Filter,
  RefreshCw,
  Star,
  Link,
  XCircle,
  ListChecks,
  Activity,
  BarChart3,
  Layers,
  MessageSquarePlus,
  Paperclip,
  Send,
  Trash2,
  Plus,
  Pencil,
  Archive,
  RotateCcw,
  Save,
  PackageCheck,
  Info,
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
  useAttachmentFile,
  useIssueLinkTypes,
  useIssueDetail,
  useIssueTransitions,
  useLinkBugToTest,
  useProjectVersions,
  useTestExecutionsByVersion,
  useTransitionIssue,
  useAddJiraComment,
  useVersionIssues,
  useVersionRunStats,
  useJiraProjects,
  useCreateVersion,
  useUpdateVersion,
  queryKeys,
} from "@/services/queries";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/tauri";
import { useExecutionProjectKey } from "@/hooks/useProjectKey";
import { parseRateLimitError } from "@/stores/uiStore";
import { useVersionsStore } from "@/stores/versionsStore";
import type { VersionGroup } from "@/stores/versionsStore";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge, statusVariant } from "@/components/ui/badge";
import { cn } from "@/components/ui/utils";
import { TestExecutionDetail } from "@/components/test-execution/TestExecutionDetail";
import type { DescriptionBlock, JiraAttachment, JiraBug, JiraCommentFlat, JiraIssueDetail, JiraTransition, JiraVersion, TestExecution } from "@/types";
import { CreateBugModal } from "@/components/bugs/CreateBugModal";
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

// ── Shared constants ──────────────────────────────────────────────────────────

const CRITICAL_PRIORITIES = new Set(["highest", "critical", "blocker", "p1"]);

const ATTACH_IMG_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"]);
const ATTACH_VID_EXTS = new Set(["mp4", "mov", "avi", "mkv", "webm"]);
const attachExt = (p: string) => p.split(".").pop()?.toLowerCase() ?? "";
const attachIsImg = (p: string) => ATTACH_IMG_EXTS.has(attachExt(p));
const attachIsVid = (p: string) => ATTACH_VID_EXTS.has(attachExt(p));
const attachName = (p: string) => p.split(/[\\/]/).pop() ?? p;

// ── KPI strip ─────────────────────────────────────────────────────────────────

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

interface VersionKpiStripProps {
  stats: ReturnType<typeof useVersionRunStats>;
  executions: TestExecution[];
  bugs: JiraBug[];
  versionIssues: JiraBug[];
}

function VersionKpiStrip({ stats, executions, bugs, versionIssues }: VersionKpiStripProps) {
  const isLoading = stats.pagesLoaded < stats.pagesExpected;

  // Pass %
  const passCount = stats.counts["PASS"] ?? stats.counts["PASSED"] ?? 0;
  const passRate = stats.total > 0 ? Math.round((passCount / stats.total) * 100) : null;
  const passScheme: KpiTileProps["colorScheme"] =
    passRate === null ? "slate" : passRate === 100 ? "emerald" : passRate >= 80 ? "blue" : "amber";

  // Failures + Blocked
  const failCount =
    (stats.counts["FAIL"] ?? stats.counts["FAILED"] ?? 0) + (stats.counts["BLOCKED"] ?? 0);
  const failScheme: KpiTileProps["colorScheme"] = failCount === 0 ? "emerald" : "red";

  // Critical / Blocker bugs (unresolved)
  const criticalBugCount = bugs.filter(
    (b) =>
      b.fields.status?.category?.key !== "done" &&
      CRITICAL_PRIORITIES.has(b.fields.priority?.name?.toLowerCase() ?? ""),
  ).length;
  const criticalScheme: KpiTileProps["colorScheme"] = criticalBugCount === 0 ? "emerald" : "red";

  // Stories progress: done + acceptance / total
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
      {/* Pass rate */}
      <KpiTile
        label="Pass rate"
        value={isLoading ? "…" : passRate === null ? "—" : `${passRate}%`}
        subValue={isLoading ? "Loading…" : `${passCount} / ${stats.total} tests`}
        icon={Activity}
        colorScheme={isLoading ? "slate" : passScheme}
        onClick={() => scrollToSection("version-section-results")}
      />

      {/* Failures */}
      <KpiTile
        label="Failures & blocked"
        value={isLoading ? "…" : failCount}
        subValue={failCount === 0 ? "All clear" : `test runs failing`}
        icon={XCircle}
        colorScheme={isLoading ? "slate" : failScheme}
        onClick={() => scrollToSection("version-section-failures")}
      />

      {/* Critical bugs */}
      <KpiTile
        label="Critical bugs"
        value={criticalBugCount}
        subValue={criticalBugCount === 0 ? "No open blockers" : "Unresolved critical/blocker"}
        icon={Bug}
        colorScheme={criticalScheme}
        onClick={() => scrollToSection("version-section-bugs")}
      />

      {/* Stories progress */}
      <KpiTile
        label="Stories progress"
        value={storiesTotal === 0 ? "—" : `${storiesDone} / ${storiesTotal}`}
        subValue={storiesTotal === 0 ? "No issues linked" : "Done or in acceptance"}
        icon={Layers}
        colorScheme={storiesScheme}
        onClick={() => scrollToSection("version-section-issues")}
      />

      {/* Executions */}
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

// ── Release readiness checklist ────────────────────────────────────────────────

interface ChecklistItem {
  label: string;
  detail: string;
  pass: boolean;
  loading?: boolean;
}

interface ReleaseReadinessChecklistProps {
  stats: ReturnType<typeof useVersionRunStats>;
  executions: TestExecution[];
  bugs: JiraBug[];
  versionIssues: JiraBug[];
  version: JiraVersion;
}

function ReleaseReadinessChecklist({
  stats,
  executions,
  bugs,
  versionIssues,
  version,
}: ReleaseReadinessChecklistProps) {
  const isLoading = stats.pagesLoaded < stats.pagesExpected;

  const todoCount =
    (stats.counts["TODO"] ?? stats.counts["NOT RUN"] ?? 0) + (stats.counts["EXECUTING"] ?? 0);
  const failCount =
    (stats.counts["FAIL"] ?? stats.counts["FAILED"] ?? 0) + (stats.counts["BLOCKED"] ?? 0);
  const criticalBugCount = bugs.filter(
    (b) =>
      b.fields.status?.category?.key !== "done" &&
      CRITICAL_PRIORITIES.has(b.fields.priority?.name?.toLowerCase() ?? ""),
  ).length;
  const storiesTotal = versionIssues.length;
  const storiesDone = versionIssues.filter(
    (i) =>
      i.fields.status?.category?.key === "done" || /acceptance/i.test(i.fields.status?.name ?? ""),
  ).length;

  const items: ChecklistItem[] = [
    {
      label: "Has at least one execution",
      detail:
        executions.length === 0
          ? "No test executions linked to this version"
          : `${executions.length} execution${executions.length !== 1 ? "s" : ""} linked`,
      pass: executions.length > 0,
    },
    {
      label: "All tests executed",
      detail: isLoading
        ? "Still loading test results…"
        : todoCount === 0
          ? "No pending or in-progress tests"
          : `${todoCount} test${todoCount !== 1 ? "s" : ""} not yet executed`,
      pass: !isLoading && todoCount === 0 && stats.total > 0,
      loading: isLoading,
    },
    {
      label: "No failures or blockers",
      detail: isLoading
        ? "Still loading test results…"
        : failCount === 0
          ? "All executed tests passed"
          : `${failCount} failure${failCount !== 1 ? "s" : ""} or blocked test${failCount !== 1 ? "s" : ""}`,
      pass: !isLoading && failCount === 0 && stats.total > 0,
      loading: isLoading,
    },
    {
      label: "No open critical bugs",
      detail:
        criticalBugCount === 0
          ? "No unresolved critical or blocker bugs"
          : `${criticalBugCount} unresolved critical/blocker bug${criticalBugCount !== 1 ? "s" : ""}`,
      pass: criticalBugCount === 0,
    },
    {
      label: "Stories in acceptance or done",
      detail:
        storiesTotal === 0
          ? "No issues linked to this version"
          : storiesDone === storiesTotal
            ? `All ${storiesTotal} issues done or in acceptance`
            : `${storiesDone} / ${storiesTotal} issues done or in acceptance`,
      pass: storiesTotal > 0 && storiesDone === storiesTotal,
    },
  ];

  const passCount = items.filter((i) => i.pass).length;
  const allPassing = passCount === items.length;
  const isReleased = version.released === true;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-slate-500 dark:text-slate-400" />
          <h3 className="font-semibold text-slate-800 dark:text-slate-200">Release readiness</h3>
        </div>
        <div className="flex items-center gap-2">
          {isReleased && (
            <span className="rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300">
              Released
            </span>
          )}
          <span
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs font-semibold",
              allPassing
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
            )}
          >
            {allPassing ? "Ready to release" : `${passCount} / ${items.length} criteria met`}
          </span>
        </div>
      </div>

      {/* Checklist rows */}
      <ul className="divide-y divide-slate-100 dark:divide-slate-700">
        {items.map((item) => (
          <li key={item.label} className="flex items-start gap-3 px-5 py-3">
            <span className="mt-0.5 shrink-0">
              {item.loading ? (
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              ) : item.pass ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
            </span>
            <div className="min-w-0">
              <p
                className={cn(
                  "text-sm font-medium",
                  item.pass
                    ? "text-slate-800 dark:text-slate-200"
                    : "text-slate-700 dark:text-slate-300",
                )}
              >
                {item.label}
              </p>
              <p
                className={cn(
                  "text-xs",
                  item.loading
                    ? "text-slate-400"
                    : item.pass
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400",
                )}
              >
                {item.detail}
              </p>
            </div>
          </li>
        ))}
      </ul>
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
  // Auto-expand when there are failures so production team sees them immediately
  const [collapsed, setCollapsed] = useState(failedTests.length === 0);

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
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
      {/* Header — always visible, clicking toggles collapsed */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full flex-wrap items-start justify-between gap-3 px-5 py-4 text-left"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
          <h3 className="font-semibold text-slate-800 dark:text-slate-200">
            Failed tests analysis
          </h3>
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300">
            {failedTests.length} test{failedTests.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="flex items-center gap-2">
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

          {/* Chevron */}
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200",
              collapsed && "-rotate-90",
            )}
          />
        </div>
      </button>

      {/* Collapsible body */}
      {!collapsed && (
        <div className="px-5 pb-5">
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
              onClick={(e) => {
                e.stopPropagation();
                setShowAll((s) => !s);
              }}
              className="mt-3 text-xs font-medium text-slate-500 hover:text-slate-700"
            >
              {showAll ? "Show less" : `Show ${failedTests.length - PREVIEW_COUNT} more…`}
            </button>
          )}
        </div>
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
    <div id="version-section-results" className="space-y-4">
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
        <div id="version-section-failures">
          <FailedTestsAnalysis
            failedTests={stats.failedTests}
            isLoading={isLoading}
            linkableBugs={bugs}
            linkTypeName={linkTypeName}
            projectKey={projectKey}
            versionName={version.name}
          />
        </div>
      )}
    </div>
  );
}

// ── Version selector ──────────────────────────────────────────────────────────

interface VersionCardProps {
  version: JiraVersion;
  isActive: boolean;
  isFavourite: boolean;
  /** Stable callback — called with the version id. */
  onClick: (id: string) => void;
  /** Stable callback — called with (event, version id). */
  onToggleFavourite: (e: React.MouseEvent, id: string) => void;
  /** Optional health dot: "green" | "amber" | "red" — only shown when data is cached. */
  healthDot?: "green" | "amber" | "red";
}

const VersionCard = memo(function VersionCard({
  version,
  isActive,
  isFavourite,
  onClick,
  onToggleFavourite,
  healthDot,
}: VersionCardProps) {
  const handleClick = useCallback(() => onClick(version.id), [onClick, version.id]);
  const handleToggleFavourite = useCallback(
    (e: React.MouseEvent) => onToggleFavourite(e, version.id),
    [onToggleFavourite, version.id],
  );
  const dotColor =
    healthDot === "green"
      ? "bg-emerald-400"
      : healthDot === "amber"
        ? "bg-amber-400"
        : healthDot === "red"
          ? "bg-red-500"
          : null;

  return (
    <button
      onClick={handleClick}
      className={cn(
        "group w-full rounded-lg border px-4 py-3 text-left transition-colors",
        isActive
          ? "border-slate-800 bg-slate-800 text-white"
          : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:bg-slate-700",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {/* Health dot — only rendered when data is available */}
          {dotColor && (
            <span
              className={cn("h-2 w-2 shrink-0 rounded-full", dotColor)}
              title={
                healthDot === "green"
                  ? "All passing"
                  : healthDot === "amber"
                    ? "Partial failures"
                    : "Failures detected"
              }
            />
          )}
          <span className="truncate font-medium text-sm">{version.name}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {version.released && (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                isActive
                  ? "bg-white/20 text-white"
                  : "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
              )}
            >
              Released
            </span>
          )}
          {version.archived && (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                isActive
                  ? "bg-white/20 text-white"
                  : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400",
              )}
            >
              Archived
            </span>
          )}
          {/* Favourite star */}
          <span
            role="button"
            aria-label={isFavourite ? "Remove from favourites" : "Add to favourites"}
            onClick={handleToggleFavourite}
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
});

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
  onHealthUpdate: (versionId: string, dot: "green" | "amber" | "red") => void;
}

function ExecutionListPanel({
  projectKey,
  version,
  onSelectExecution,
  onReload,
  isRefreshing,
  onHealthUpdate,
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
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading executions…</span>
        </div>
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
        onHealthUpdate={onHealthUpdate}
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
  /** The version this panel belongs to — used for the Create Bug modal. Null hides the Create Bug button. */
  version: JiraVersion | null;
  projectKey: string;
}

function BugsPanel({ bugs, isLoading, isError, error, failedTests, version, projectKey }: BugsPanelProps) {
  const [createBugOpen, setCreateBugOpen] = useState(false);
  // ── priority summary counts ───────────────────────────────────────────────
  const prioritySummary = useMemo(() => {
    const list = bugs ?? [];
    const counts: Record<string, number> = {};
    for (const b of list) {
      if (b.fields.status?.category?.key === "done") continue; // only unresolved
      const p = b.fields.priority?.name;
      if (p) counts[p] = (counts[p] ?? 0) + 1;
    }
    return PRIORITY_ORDER.filter((p) => counts[p])
      .concat(
        Object.keys(counts)
          .filter((p) => !PRIORITY_ORDER.includes(p))
          .sort(),
      )
      .map((p) => ({ name: p, count: counts[p] }));
  }, [bugs]);

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
      <div className="flex h-16 items-center justify-center gap-2 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading bugs…</span>
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
    <div
      id="version-section-bugs"
      className="mt-4 overflow-hidden rounded-2xl border border-red-200 bg-white shadow-sm dark:border-red-900/60 dark:bg-slate-800"
    >
      {/* Header strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-red-50 px-4 py-2.5 dark:bg-red-950/60">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-red-500 dark:text-red-400">
          <Bug className="h-3.5 w-3.5" />
          Bugs ({list.length})
          {hasActiveFilters && (
            <span className="ml-1 rounded-full bg-red-600 px-1.5 py-0.5 text-white">
              {filtered.length} shown
            </span>
          )}
        </div>
        {version && (
          <button
            onClick={() => setCreateBugOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600"
          >
            <Bug className="h-3 w-3" />
            Create Bug
          </button>
        )}
        {/* Priority summary bar — shows unresolved counts per priority */}
        {prioritySummary.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {prioritySummary.map(({ name, count }) => (
              <span
                key={name}
                className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300"
                title={`${count} unresolved ${name} bug${count !== 1 ? "s" : ""}`}
              >
                <span className={cn("font-bold leading-none", priorityClass(name))}>●</span>
                <span className="font-semibold">{name}:</span>
                <span>{count}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="p-4">
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

      {version && (
        <CreateBugModal
          open={createBugOpen}
          onClose={() => setCreateBugOpen(false)}
          projectKey={projectKey}
          version={version}
        />
      )}
    </div>
  );
}

// ── Issue detail modal ────────────────────────────────────────────────────────

function IssueDetailModal({
  issueKey,
  projectKey,
  versionName,
  onClose,
}: {
  issueKey: string;
  projectKey: string;
  versionName: string;
  onClose: () => void;
}) {
  const { data: detail, isLoading, isError } = useIssueDetail(issueKey);

  const [commentText, setCommentText] = useState("");
  const { mutate: addComment, isPending: commentPending, isSuccess: commentSent, reset: resetComment } = useAddJiraComment();
  const commentRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (commentSent) {
      setCommentText("");
      resetComment();
    }
  }, [commentSent, resetComment]);

  function submitComment() {
    const body = commentText.trim();
    if (!body) return;
    addComment({ issueKey, body });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-700">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-900/30">
              <FileText className="h-4 w-4 text-indigo-500 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {isLoading ? "Loading…" : detail?.summary ?? issueKey}
              </h2>
              <p className="font-mono text-xs text-slate-400">{issueKey}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading issue details…
            </div>
          )}
          {isError && (
            <p className="text-sm text-red-500">Failed to load issue details.</p>
          )}
          {detail && (
            <IssueDetailContent
              detail={detail}
              issueKey={issueKey}
              projectKey={projectKey}
              versionName={versionName}
            />
          )}
        </div>

        {/* Comment footer */}
        <div className="shrink-0 border-t border-slate-100 px-5 py-3 dark:border-slate-700">
          <textarea
            ref={commentRef}
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitComment();
            }}
            placeholder="Add a comment… (⌘↵ to send)"
            rows={2}
            className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 placeholder-slate-400 outline-none focus:border-indigo-400 focus:bg-white dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:placeholder-slate-500 dark:focus:border-indigo-500 dark:focus:bg-slate-900"
          />
          <div className="mt-2 flex justify-end">
            <button
              onClick={submitComment}
              disabled={!commentText.trim() || commentPending}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-40 dark:bg-indigo-500 dark:hover:bg-indigo-600"
            >
              {commentPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              Comment
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AttachmentPreview({ attachment, inline = false }: { attachment: JiraAttachment; inline?: boolean }) {
  const isImage = attachment.mime_type.startsWith("image/");
  const isVideo = attachment.mime_type.startsWith("video/");
  const isMedia = isImage || isVideo;

  // Thumbnail: use Jira's thumbnail URL for images (smaller), full URL for video/others.
  const thumbUrl = isImage && attachment.thumbnail ? attachment.thumbnail : attachment.content;
  const { data: thumbDataUri, isLoading, isError } = useAttachmentFile(
    isMedia ? thumbUrl : null,
    attachment.mime_type,
  );

  const [lightboxOpen, setLightboxOpen] = useState(false);
  // Fetch full-res only when lightbox is open and it's different from the thumb URL.
  const needsFullFetch = lightboxOpen && isImage && attachment.thumbnail != null;
  const { data: fullDataUri } = useAttachmentFile(
    needsFullFetch ? attachment.content : null,
    attachment.mime_type,
  );
  const lightboxSrc = needsFullFetch ? (fullDataUri ?? thumbDataUri) : thumbDataUri;

  return (
    <>
      <div className={cn("flex flex-col items-center gap-1", inline && "w-full items-start")}>
        <div
          className={cn(
            "flex items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800",
            inline ? "max-h-64 w-full" : "h-20 w-20",
            isMedia && !isError && "cursor-pointer hover:opacity-90",
          )}
          onClick={() => isMedia && thumbDataUri && setLightboxOpen(true)}
          title={attachment.filename}
        >
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          ) : isError || !thumbDataUri ? (
            <FileText className="h-6 w-6 text-slate-400" />
          ) : isImage ? (
            <img src={thumbDataUri} alt={attachment.filename} className={cn("object-contain", inline ? "max-h-64 w-auto" : "h-full w-full object-cover")} />
          ) : isVideo ? (
            <video src={thumbDataUri} className="h-full w-full object-cover" muted preload="metadata" />
          ) : null}
        </div>
        {!inline && (
          <p className="w-20 truncate text-center text-[10px] text-slate-500 dark:text-slate-400" title={attachment.filename}>
            {attachment.filename}
          </p>
        )}
      </div>

      {/* Lightbox */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-6"
          style={{ background: "rgba(0,0,0,0.85)" }}
          onClick={() => setLightboxOpen(false)}
        >
          <button
            className="absolute right-4 top-4 rounded-full bg-black/40 p-2 text-white hover:bg-black/60"
            onClick={() => setLightboxOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
          {isImage && lightboxSrc ? (
            <img
              src={lightboxSrc}
              alt={attachment.filename}
              className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          ) : isVideo && thumbDataUri ? (
            <video
              src={thumbDataUri}
              controls
              autoPlay
              className="max-h-full max-w-full rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <Loader2 className="h-8 w-8 animate-spin text-white" />
          )}
          <p className="absolute bottom-4 left-0 right-0 text-center text-sm text-white/70">
            {attachment.filename}
          </p>
        </div>
      )}
    </>
  );
}

function StatusTransitionDropdown({
  issueKey,
  projectKey,
  versionName,
  currentStatus,
}: {
  issueKey: string;
  projectKey: string;
  versionName: string;
  currentStatus: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data: transitions, isLoading } = useIssueTransitions(open ? issueKey : null);
  const { mutate: transitionIssue, isPending } = useTransitionIssue();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const statusColor = (() => {
    const s = currentStatus.toLowerCase();
    if (s.includes("done") || s.includes("closed")) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
    if (s.includes("progress") || s.includes("acceptance")) return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    return "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300";
  })();

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={isPending}
        className={cn(
          "flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium transition-opacity hover:opacity-80",
          statusColor,
          isPending && "opacity-50",
        )}
      >
        {isPending ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <ChevronDown className="h-2.5 w-2.5" />}
        {currentStatus}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 min-w-[180px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
          {isLoading ? (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-400">
              <Loader2 className="h-3 w-3 animate-spin" />Loading…
            </div>
          ) : !transitions?.length ? (
            <p className="px-3 py-2 text-xs italic text-slate-400">No transitions available</p>
          ) : (
            <ul>
              {transitions.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => {
                      transitionIssue(
                        { issueKey, transitionId: t.id, executionProjectKey: projectKey, versionName },
                        { onSettled: () => setOpen(false) },
                      );
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <span className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      t.to.category?.key === "done" ? "bg-emerald-500"
                      : t.to.category?.key === "indeterminate" ? "bg-blue-500"
                      : "bg-slate-400",
                    )} />
                    {t.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function IssueDetailContent({
  detail,
  issueKey,
  projectKey,
  versionName,
}: {
  detail: JiraIssueDetail;
  issueKey: string;
  projectKey: string;
  versionName: string;
}) {
  const attachmentByFilename = useMemo(
    () => new Map(detail.attachments.map((a) => [a.filename, a])),
    [detail.attachments],
  );

  // Filenames embedded inline in the description — excluded from the bottom attachment grid.
  const embeddedFilenames = useMemo(
    () => new Set(detail.description_blocks.filter((b): b is Extract<DescriptionBlock, { type: "media" }> => b.type === "media").map((b) => b.filename)),
    [detail.description_blocks],
  );

  const remainingAttachments = detail.attachments.filter((a) => !embeddedFilenames.has(a.filename));

  const hasDescription = detail.description_blocks.length > 0;

  return (
    <div className="space-y-4">
      {/* Meta row */}
      <div className="flex flex-wrap gap-2">
        {detail.issue_type && (
          <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {detail.issue_type}
          </span>
        )}
        {detail.status && (
          <StatusTransitionDropdown
            issueKey={issueKey}
            projectKey={projectKey}
            versionName={versionName}
            currentStatus={detail.status}
          />
        )}
        {detail.priority && (
          <span className={cn("rounded px-2 py-0.5 text-xs font-medium", priorityClass(detail.priority))}>
            {detail.priority}
          </span>
        )}
        {detail.assignee && (
          <span className="flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <User className="h-3 w-3" />
            {detail.assignee}
          </span>
        )}
      </div>

      {/* Description — interleaved text + inline media */}
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Description</p>
        {hasDescription ? (
          <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800">
            {detail.description_blocks.map((block, i) => {
              if (block.type === "text") {
                return (
                  <p key={i} className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">
                    {block.content}
                  </p>
                );
              }
              const att = attachmentByFilename.get(block.filename);
              return att ? (
                <div key={i} className="py-1">
                  <AttachmentPreview attachment={att} inline />
                </div>
              ) : null;
            })}
          </div>
        ) : (
          <p className="text-sm italic text-slate-400">No description.</p>
        )}
      </div>

      {/* Non-embedded attachments */}
      {remainingAttachments.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Attachments ({remainingAttachments.length})
          </p>
          <div className="flex flex-wrap gap-3">
            {remainingAttachments.map((att) => (
              <AttachmentPreview key={att.id} attachment={att} />
            ))}
          </div>
        </div>
      )}

      {/* Comments */}
      {detail.comments.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Comments ({detail.comments.length})
          </p>
          <div className="space-y-2">
            {detail.comments.map((c) => (
              <CommentItem key={c.id} comment={c} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CommentItem({ comment }: { comment: JiraCommentFlat }) {
  const date = comment.created
    ? new Date(comment.created).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-300">
          {comment.author?.[0]?.toUpperCase() ?? "?"}
        </span>
        <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
          {comment.author ?? "Unknown"}
        </span>
        {date && (
          <span className="ml-auto text-[10px] text-slate-400">{date}</span>
        )}
      </div>
      {comment.body ? (
        <p className="whitespace-pre-wrap text-xs text-slate-600 dark:text-slate-300">
          {comment.body}
        </p>
      ) : (
        <p className="text-xs italic text-slate-400">Empty comment.</p>
      )}
    </div>
  );
}

// ── Version issues panel (Stories / Tasks / Bugs by fixVersion) ───────────────

interface VersionIssuesPanelProps {
  projectKey: string;
  versionName: string;
}

function VersionIssuesPanel({ projectKey, versionName }: VersionIssuesPanelProps) {
  const { data: issues, isLoading, isError, error } = useVersionIssues(projectKey, versionName);

  const { done, inAcceptance } = useMemo(() => {
    const list = issues ?? [];
    const done: JiraBug[] = [];
    const inAcceptance: JiraBug[] = [];
    for (const issue of list) {
      const categoryKey = issue.fields.status?.category?.key ?? "";
      const statusName = issue.fields.status?.name ?? "";
      if (categoryKey === "done") {
        done.push(issue);
      } else if (/acceptance/i.test(statusName)) {
        inAcceptance.push(issue);
      }
    }
    return { done, inAcceptance };
  }, [issues]);

  if (isLoading) {
    return (
      <div className="mt-4 overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-sm dark:border-indigo-900/60 dark:bg-slate-800">
        <div className="flex items-center gap-1.5 bg-indigo-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-indigo-500 dark:bg-indigo-950/60 dark:text-indigo-400">
          <CheckCircle className="h-3.5 w-3.5" />
          Version Issues
        </div>
        <div className="space-y-1.5 p-4">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading version issues…</span>
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded border border-slate-100 px-3 py-2 dark:border-slate-700"
            >
              <Skeleton className="h-4 w-16 shrink-0" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mt-4 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
        Failed to load version issues: {String(error)}
      </div>
    );
  }

  const list = issues ?? [];

  if (list.length === 0) {
    return (
      <div className="mt-4 overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-sm dark:border-indigo-900/60 dark:bg-slate-800">
        <div className="flex items-center gap-1.5 bg-indigo-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-indigo-500 dark:bg-indigo-950/60 dark:text-indigo-400">
          <CheckCircle className="h-3.5 w-3.5" />
          Version Issues
        </div>
        <p className="p-4 text-xs italic text-slate-400">
          No stories, tasks, or bugs found for this version.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-sm dark:border-indigo-900/60 dark:bg-slate-800">
      {/* Header strip */}
      <div className="flex items-center gap-1.5 bg-indigo-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-indigo-500 dark:bg-indigo-950/60 dark:text-indigo-400">
        <CheckCircle className="h-3.5 w-3.5" />
        Version Issues ({list.length})
      </div>

      <div className="p-4">
        {/* In Acceptance Testing section */}
        {inAcceptance.length > 0 && (
          <div className="mb-3">
            <div className="mb-1.5 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                In Acceptance Testing ({inAcceptance.length})
              </span>
            </div>
            <div className="space-y-1.5">
              {inAcceptance.map((issue) => (
                <VersionIssueRow
                  key={issue.id}
                  issue={issue}
                  projectKey={projectKey}
                  versionName={versionName}
                />
              ))}
            </div>
          </div>
        )}

        {/* Done section */}
        {done.length > 0 && (
          <div className={cn(inAcceptance.length > 0 && "mt-3")}>
            <div className="mb-1.5 flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                Done ({done.length})
              </span>
            </div>
            <div className="space-y-1.5">
              {done.map((issue) => (
                <VersionIssueRow
                  key={issue.id}
                  issue={issue}
                  projectKey={projectKey}
                  versionName={versionName}
                />
              ))}
            </div>
          </div>
        )}

        {/* Issues that are neither done nor in acceptance */}
        {list.length > done.length + inAcceptance.length && (
          <div className={cn(done.length + inAcceptance.length > 0 && "mt-3")}>
            <div className="mb-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
              Other ({list.length - done.length - inAcceptance.length})
            </div>
            <div className="space-y-1.5">
              {list
                .filter((issue) => {
                  const categoryKey = issue.fields.status?.category?.key ?? "";
                  const statusName = issue.fields.status?.name ?? "";
                  return categoryKey !== "done" && !/acceptance/i.test(statusName);
                })
                .map((issue) => (
                  <VersionIssueRow
                    key={issue.id}
                    issue={issue}
                    projectKey={projectKey}
                    versionName={versionName}
                  />
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function VersionIssueRow({
  issue,
  projectKey,
  versionName,
}: {
  issue: JiraBug;
  projectKey: string;
  versionName: string;
}) {
  const typeName = issue.fields.issue_type?.name ?? "";

  // Issue detail modal
  const [detailOpen, setDetailOpen] = useState(false);

  // Status transition
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { data: transitions, isLoading: transitionsLoading } = useIssueTransitions(
    menuOpen ? issue.key : null,
  );
  const { mutate: transitionIssue, isPending: transitioning } = useTransitionIssue();

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  function applyTransition(t: JiraTransition) {
    transitionIssue(
      { issueKey: issue.key, transitionId: t.id, executionProjectKey: projectKey, versionName },
      { onSettled: () => setMenuOpen(false) },
    );
  }

  // Comment
  const [commentOpen, setCommentOpen] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const { mutate: addComment, isPending: commentPending, reset: resetComment } = useAddJiraComment();

  useEffect(() => {
    if (commentOpen) {
      setTimeout(() => commentRef.current?.focus(), 50);
    } else {
      setCommentText("");
      setAttachments([]);
      resetComment();
    }
  }, [commentOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  async function pickFiles() {
    const result = await openFilePicker({
      multiple: true,
      title: "Select images or videos",
      filters: [{ name: "Images & Videos", extensions: ["jpg", "jpeg", "png", "gif", "webp", "bmp", "mp4", "mov", "avi", "mkv", "webm"] }],
    });
    if (!result) return;
    const paths = Array.isArray(result) ? result : [result];
    setAttachments((prev) => {
      const seen = new Set(prev);
      return [...prev, ...paths.filter((p) => !seen.has(p))];
    });
  }

  function submitComment() {
    const body = commentText.trim();
    if (!body) return;
    addComment(
      { issueKey: issue.key, body, attachmentPaths: attachments },
      { onSuccess: () => setCommentOpen(false) },
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white transition-colors hover:border-indigo-400 hover:bg-indigo-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-indigo-500 dark:hover:bg-indigo-900/40">
      {/* Main row */}
      <div className="flex items-start gap-3 px-3 py-2.5">
        {/* Priority dot */}
        <span
          className={cn("mt-0.5 shrink-0 font-bold leading-none", priorityClass(issue.fields.priority?.name))}
          title={issue.fields.priority?.name ?? "No priority"}
        >
          ●
        </span>

        {/* Key + summary — clickable to open detail modal */}
        <button
          className="min-w-0 flex-1 text-left"
          onClick={() => setDetailOpen(true)}
          title="View issue details"
        >
          <p className="truncate text-sm text-slate-800 dark:text-slate-200">{issue.fields.summary}</p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <p className="font-mono text-xs text-slate-400">{issue.key}</p>
            {typeName && (
              <span className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-[10px] font-medium text-slate-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300">
                {typeName}
              </span>
            )}
          </div>
        </button>

        {/* Assignee */}
        {issue.fields.assignee && (
          <span className="flex shrink-0 items-center gap-1 text-xs text-slate-400">
            <User className="h-3 w-3" />
            {issue.fields.assignee.display_name}
          </span>
        )}

        {/* Add comment */}
        <button
          onClick={() => setCommentOpen((o) => !o)}
          title="Add comment"
          className={cn(
            "shrink-0 rounded p-1 transition-colors",
            commentOpen
              ? "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
              : "text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300",
          )}
        >
          <MessageSquarePlus className="h-3.5 w-3.5" />
        </button>

        {/* Status badge */}
        {issue.fields.status && (
          <div className="relative shrink-0" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              disabled={transitioning}
              title="Change status"
              className={cn(
                "flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-opacity",
                statusCategoryClass(issue.fields.status.category?.key),
                "hover:opacity-80",
                transitioning && "opacity-50",
              )}
            >
              {transitioning ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <ChevronDown className="h-2.5 w-2.5" />}
              {issue.fields.status.name}
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full z-20 mt-1 min-w-[160px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
                {transitionsLoading ? (
                  <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-400">
                    <Loader2 className="h-3 w-3 animate-spin" />Loading…
                  </div>
                ) : !transitions?.length ? (
                  <p className="px-3 py-2 text-xs italic text-slate-400">No transitions available</p>
                ) : (
                  <ul>
                    {transitions.map((t) => (
                      <li key={t.id}>
                        <button
                          onClick={() => applyTransition(t)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700"
                        >
                          <span className={cn("h-2 w-2 shrink-0 rounded-full",
                            t.to.category?.key === "done" ? "bg-emerald-500"
                            : t.to.category?.key === "indeterminate" ? "bg-blue-500"
                            : "bg-slate-400"
                          )} />
                          {t.name}
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

      {/* Issue detail modal */}
      {detailOpen && (
        <IssueDetailModal
          issueKey={issue.key}
          projectKey={projectKey}
          versionName={versionName}
          onClose={() => setDetailOpen(false)}
        />
      )}

      {/* Inline comment panel */}
      {commentOpen && (
        <div className="border-t border-slate-100 px-3 pb-3 pt-2 dark:border-slate-700">
          <textarea
            ref={commentRef}
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitComment();
              if (e.key === "Escape") setCommentOpen(false);
            }}
            placeholder="Add a comment… (⌘↵ to send)"
            rows={3}
            className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 placeholder-slate-400 outline-none focus:border-slate-400 focus:bg-white dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:placeholder-slate-500 dark:focus:border-slate-500 dark:focus:bg-slate-800"
          />

          {/* Attachment thumbnails */}
          {attachments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {attachments.map((path) => {
                const name = attachName(path);
                const src = convertFileSrc(path);
                return (
                  <div
                    key={path}
                    title={name}
                    className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
                  >
                    {attachIsImg(path) ? (
                      <img src={src} alt={name} className="h-full w-full object-cover" />
                    ) : attachIsVid(path) ? (
                      <video src={src} className="h-full w-full object-cover" muted preload="metadata" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[10px] text-slate-400">{name}</div>
                    )}
                    <button
                      type="button"
                      onClick={() => setAttachments((prev) => prev.filter((p) => p !== path))}
                      className="absolute right-0.5 top-0.5 rounded bg-black/50 p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <Trash2 className="h-2.5 w-2.5 text-white" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => void pickFiles()}
              className="flex items-center gap-1.5 rounded border border-dashed border-slate-300 px-2 py-1 text-xs text-slate-500 hover:border-slate-400 hover:bg-slate-50 dark:border-slate-600 dark:hover:border-slate-500 dark:hover:bg-slate-800"
            >
              <Paperclip className="h-3 w-3" />
              Attach
              {attachments.length > 0 && (
                <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-400">
                  {attachments.length}
                </span>
              )}
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCommentOpen(false)}
                className="rounded px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={submitComment}
                disabled={!commentText.trim() || commentPending}
                className="flex items-center gap-1.5 rounded bg-slate-800 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-slate-300"
              >
                {commentPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                Comment
              </button>
            </div>
          </div>
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
  onHealthUpdate: (versionId: string, dot: "green" | "amber" | "red") => void;
}

function VersionContent({
  projectKey,
  executions,
  version,
  onSelectExecution,
  onHealthUpdate,
}: VersionContentProps) {
  const {
    data: bugs,
    isLoading: bugsLoading,
    isError: bugsError,
    error: bugsErr,
  } = useBugsByVersion(projectKey, version.name);
  const { data: versionIssues } = useVersionIssues(projectKey, version.name);
  const stats = useVersionRunStats(executions, bugs);

  // Update health dot once all pages have loaded
  const allLoaded = stats.pagesLoaded >= stats.pagesExpected && stats.pagesExpected > 0;
  useEffect(() => {
    if (!allLoaded || stats.total === 0) return;
    const failCount =
      (stats.counts["FAIL"] ?? stats.counts["FAILED"] ?? 0) + (stats.counts["BLOCKED"] ?? 0);
    const passCount = stats.counts["PASS"] ?? stats.counts["PASSED"] ?? 0;
    const passRate = passCount / stats.total;
    const dot: "green" | "amber" | "red" =
      failCount === 0 ? "green" : passRate >= 0.8 ? "amber" : "red";
    onHealthUpdate(version.id, dot);
  }, [allLoaded, stats.counts, stats.total, version.id, onHealthUpdate]);

  return (
    <>
      {/* KPI strip — shown as soon as we have executions */}
      {executions.length > 0 && (
        <div className="mb-4 space-y-3">
          <VersionKpiStrip
            stats={stats}
            executions={executions}
            bugs={bugs ?? []}
            versionIssues={versionIssues ?? []}
          />
          <ReleaseReadinessChecklist
            stats={stats}
            executions={executions}
            bugs={bugs ?? []}
            versionIssues={versionIssues ?? []}
            version={version}
          />
        </div>
      )}

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
        version={version}
        projectKey={projectKey}
      />

      <div id="version-section-issues">
        <VersionIssuesPanel projectKey={projectKey} versionName={version.name} />
      </div>

      {executions.length > 0 && (
        <div id="version-section-executions" className="mt-4">
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

// ── Version Groups ────────────────────────────────────────────────────────────

function VersionGroupCard({
  group,
  versions,
  isActive,
  onClick,
}: {
  group: VersionGroup;
  versions: JiraVersion[];
  isActive: boolean;
  onClick: (id: string) => void;
}) {
  const memberNames = group.versionIds
    .map((id) => versions.find((v) => v.id === id)?.name)
    .filter(Boolean) as string[];

  return (
    <button
      onClick={() => onClick(group.id)}
      className={cn(
        "w-full rounded-lg border px-3 py-2 text-left transition-all text-xs",
        isActive
          ? "border-violet-400 bg-violet-50 shadow-sm dark:border-violet-500 dark:bg-violet-900/30"
          : "border-transparent hover:border-violet-200 hover:bg-violet-50/60 dark:hover:border-violet-700/60 dark:hover:bg-violet-900/20",
      )}
    >
      <div className="flex items-center gap-1.5">
        <Layers className="h-3 w-3 shrink-0 text-violet-500" />
        <span className="font-medium text-slate-800 dark:text-slate-100">{group.name}</span>
        <span className="ml-auto shrink-0 text-[10px] text-slate-400">
          {memberNames.length}v
        </span>
      </div>
      {memberNames.length > 0 && (
        <p className="mt-0.5 truncate text-[10px] text-slate-400 dark:text-slate-500">
          {memberNames.join(" · ")}
        </p>
      )}
    </button>
  );
}

/** Fetches bugs + issues for all versions in a group, merges them, and renders the report. */
function GroupVersionContent({
  group,
  projectKey,
  versions,
  executions,
  onSelectExecution,
  onHealthUpdate,
}: {
  group: VersionGroup;
  projectKey: string;
  versions: JiraVersion[];
  executions: TestExecution[];
  onSelectExecution: (exec: TestExecution) => void;
  onHealthUpdate: (id: string, dot: "green" | "amber" | "red") => void;
}) {
  const bugResults = useQueries({
    queries: versions.map((v) => ({
      queryKey: queryKeys.bugsByVersion(projectKey, v.name),
      queryFn: () => api.getBugsByVersion(projectKey, v.name),
      staleTime: 2 * 60 * 1_000,
      gcTime: Infinity,
    })),
  });

  const issueResults = useQueries({
    queries: versions.map((v) => ({
      queryKey: queryKeys.versionIssues(projectKey, v.name),
      queryFn: () => api.getVersionIssues(projectKey, v.name),
      staleTime: 2 * 60 * 1_000,
      gcTime: Infinity,
    })),
  });

  const bugs = useMemo(() => {
    const seen = new Set<string>();
    return bugResults.flatMap((r) => r.data ?? []).filter((b) => {
      if (seen.has(b.id)) return false;
      seen.add(b.id);
      return true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bugResults]);

  const versionIssues = useMemo(() => {
    const seen = new Set<string>();
    return issueResults.flatMap((r) => r.data ?? []).filter((i) => {
      if (seen.has(i.id)) return false;
      seen.add(i.id);
      return true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issueResults]);

  const stats = useVersionRunStats(executions, bugs);

  const syntheticVersion = useMemo<JiraVersion>(
    () => ({
      id: `group:${group.id}`,
      name: group.name,
      description: `${versions.length} version${versions.length !== 1 ? "s" : ""}: ${versions.map((v) => v.name).join(", ")}`,
    }),
    [group, versions],
  );

  const allLoaded = stats.pagesLoaded >= stats.pagesExpected && stats.pagesExpected > 0;
  useEffect(() => {
    if (!allLoaded || stats.total === 0) return;
    const failCount =
      (stats.counts["FAIL"] ?? stats.counts["FAILED"] ?? 0) + (stats.counts["BLOCKED"] ?? 0);
    const passCount = stats.counts["PASS"] ?? stats.counts["PASSED"] ?? 0;
    const dot: "green" | "amber" | "red" =
      failCount === 0 ? "green" : passCount / stats.total >= 0.8 ? "amber" : "red";
    onHealthUpdate(`group:${group.id}`, dot);
  }, [allLoaded, stats.counts, stats.total, group.id, onHealthUpdate]);

  const bugsLoading = bugResults.some((r) => r.isLoading);
  const bugsError = bugResults.some((r) => r.isError);
  const bugsErr = bugResults.find((r) => r.isError)?.error;

  return (
    <>
      {executions.length > 0 && (
        <div className="mb-4 space-y-3">
          <VersionKpiStrip
            stats={stats}
            executions={executions}
            bugs={bugs}
            versionIssues={versionIssues}
          />
          <ReleaseReadinessChecklist
            stats={stats}
            executions={executions}
            bugs={bugs}
            versionIssues={versionIssues}
            version={syntheticVersion}
          />
        </div>
      )}

      <VersionDashboard
        stats={stats}
        executions={executions}
        version={syntheticVersion}
        projectKey={projectKey}
        bugs={bugs}
      />

      <BugsPanel
        bugs={bugs}
        isLoading={bugsLoading}
        isError={bugsError}
        error={bugsErr}
        failedTests={stats.failedTests}
        version={null}
        projectKey={projectKey}
      />

      {/* Show version issues per member version */}
      {versions.map((v) => (
        <div key={v.id} className="mt-4">
          <VersionIssuesPanel projectKey={projectKey} versionName={v.name} />
        </div>
      ))}

      {executions.length > 0 && (
        <div id="version-section-executions" className="mt-4">
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

/** Fetches test executions for all versions in a group, merges them, then delegates to GroupVersionContent. */
function GroupReportPanel({
  group,
  projectKey,
  versions,
  onSelectExecution,
  onReload,
  isRefreshing,
  onHealthUpdate,
}: {
  group: VersionGroup;
  projectKey: string;
  versions: JiraVersion[];
  onSelectExecution: (exec: TestExecution) => void;
  onReload: () => void;
  isRefreshing: boolean;
  onHealthUpdate: (id: string, dot: "green" | "amber" | "red") => void;
}) {
  const groupVersions = useMemo(
    () => versions.filter((v) => group.versionIds.includes(v.id)),
    [versions, group.versionIds],
  );

  const execResults = useQueries({
    queries: groupVersions.map((v) => ({
      queryKey: queryKeys.testExecutionsByVersion(projectKey, v.name),
      queryFn: () => api.getTestExecutionsByVersion(projectKey, v.name),
      staleTime: 2 * 60 * 1_000,
      gcTime: Infinity,
    })),
  });

  const isLoading = execResults.some((r) => r.isLoading);

  const executions = useMemo(() => {
    const seen = new Set<string>();
    return execResults.flatMap((r) => r.data ?? []).filter((e) => {
      if (seen.has(e.issue_id)) return false;
      seen.add(e.issue_id);
      return true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [execResults]);

  if (groupVersions.length === 0) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-2 text-slate-400 dark:text-slate-500">
        <Layers className="h-8 w-8 opacity-40" />
        <p className="text-sm">This group has no versions yet.</p>
        <p className="text-xs">Add versions in the Manage Versions tab.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2 p-2">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading executions…</span>
        </div>
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-1">
          {groupVersions.map((v) => (
            <span
              key={v.id}
              className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
            >
              {v.name}
            </span>
          ))}
        </div>
        <button
          onClick={onReload}
          disabled={isRefreshing}
          title="Reload group data"
          className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40 dark:hover:bg-slate-700"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
          Reload
        </button>
      </div>
      <GroupVersionContent
        group={group}
        projectKey={projectKey}
        versions={groupVersions}
        executions={executions}
        onSelectExecution={onSelectExecution}
        onHealthUpdate={onHealthUpdate}
      />
    </div>
  );
}

// ── Confirm modal ─────────────────────────────────────────────────────────────

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  /** Red destructive style when true, otherwise amber/warning. */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="mx-4 w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-start gap-3">
          <div
            className={cn(
              "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
              danger
                ? "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400"
                : "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400",
            )}
          >
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{message}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-semibold text-white",
              danger
                ? "bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600"
                : "bg-amber-500 hover:bg-amber-600 dark:bg-amber-500 dark:hover:bg-amber-600",
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Manage Versions tab ───────────────────────────────────────────────────────

function ManageVersionsTab({
  projectKey,
  versions,
}: {
  projectKey: string;
  versions: JiraVersion[];
}) {
  const { data: projects } = useJiraProjects();
  const project = projects?.find((p) => p.key === projectKey);
  const { mutate: createVersion, isPending: creating } = useCreateVersion(projectKey);
  const { mutate: updateVersion } = useUpdateVersion(projectKey);
  const { versionGroups, addVersionGroup, updateVersionGroup, removeVersionGroup } =
    useVersionsStore();
  const groups = versionGroups[projectKey] ?? [];

  // ── Create form state ──
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newStartDate, setNewStartDate] = useState("");
  const [newReleaseDate, setNewReleaseDate] = useState("");

  // ── Group form state ──
  const [showGroupCreate, setShowGroupCreate] = useState(false);
  const [pendingDeleteGroupId, setPendingDeleteGroupId] = useState<string | null>(null);
  const pendingDeleteGroup = groups.find((g) => g.id === pendingDeleteGroupId) ?? null;
  const [groupName, setGroupName] = useState("");
  const [groupVersionIds, setGroupVersionIds] = useState<string[]>([]);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState("");
  const [editGroupVersionIds, setEditGroupVersionIds] = useState<string[]>([]);

  function submitCreateGroup() {
    if (!groupName.trim() || groupVersionIds.length === 0) return;
    addVersionGroup(projectKey, {
      id: `group_${Date.now()}`,
      name: groupName.trim(),
      versionIds: groupVersionIds,
    });
    setShowGroupCreate(false);
    setGroupName("");
    setGroupVersionIds([]);
  }

  function startEditGroup(g: VersionGroup) {
    setEditingGroupId(g.id);
    setEditGroupName(g.name);
    setEditGroupVersionIds([...g.versionIds]);
  }

  function saveEditGroup() {
    if (!editingGroupId || !editGroupName.trim()) return;
    updateVersionGroup(projectKey, {
      id: editingGroupId,
      name: editGroupName.trim(),
      versionIds: editGroupVersionIds,
    });
    setEditingGroupId(null);
  }

  function toggleGroupVersion(versionId: string, checked: boolean) {
    setGroupVersionIds((prev) =>
      checked ? [...prev, versionId] : prev.filter((id) => id !== versionId),
    );
  }

  function toggleEditGroupVersion(versionId: string, checked: boolean) {
    setEditGroupVersionIds((prev) =>
      checked ? [...prev, versionId] : prev.filter((id) => id !== versionId),
    );
  }

  function submitCreate() {
    if (!newName.trim() || !project?.id) return;
    const trimmedDesc = newDescription.trim();
    createVersion(
      {
        projectId: project.id,
        name: newName.trim(),
        ...(trimmedDesc ? { description: trimmedDesc } : {}),
        ...(newStartDate ? { startDate: newStartDate } : {}),
        ...(newReleaseDate ? { releaseDate: newReleaseDate } : {}),
      },
      {
        onSuccess: () => {
          setShowCreate(false);
          setNewName("");
          setNewDescription("");
          setNewStartDate("");
          setNewReleaseDate("");
        },
      },
    );
  }

  // Sort: unreleased → released → archived
  const sorted = useMemo(() => {
    const order = (v: JiraVersion) => (v.archived ? 2 : v.released ? 1 : 0);
    return [...versions].sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));
  }, [versions]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {versions.length} version{versions.length !== 1 ? "s" : ""} in{" "}
          <span className="font-medium text-slate-700 dark:text-slate-200">{projectKey}</span>
        </p>
        <button
          onClick={() => setShowCreate((o) => !o)}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
        >
          <Plus className="h-3.5 w-3.5" />
          New Version
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 dark:border-indigo-800/60 dark:bg-indigo-950/30">
          <p className="mb-3 text-xs font-semibold text-indigo-700 dark:text-indigo-300">New Version</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitCreate()}
                placeholder="e.g. 2.0.0"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-indigo-500"
              />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Description
              </label>
              <input
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Optional description"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Start Date
              </label>
              <input
                type="date"
                value={newStartDate}
                onChange={(e) => setNewStartDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Release Date
              </label>
              <input
                type="date"
                value={newReleaseDate}
                onChange={(e) => setNewReleaseDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-indigo-500"
              />
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={() => setShowCreate(false)}
              className="rounded-lg px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={submitCreate}
              disabled={!newName.trim() || !project?.id || creating}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-40 dark:bg-indigo-500 dark:hover:bg-indigo-600"
            >
              {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              Create
            </button>
          </div>
        </div>
      )}

      {/* Versions table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60">
              <th className="px-4 py-2.5 text-left font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Status</th>
              <th className="px-4 py-2.5 text-left font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Name</th>
              <th className="px-4 py-2.5 text-left font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Description</th>
              <th className="px-4 py-2.5 text-left font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Start Date</th>
              <th className="px-4 py-2.5 text-left font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Release Date</th>
              <th className="px-4 py-2.5 text-right font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
            {sorted.map((v) => (
              <VersionRow
                key={v.id}
                version={v}
                onUpdate={(patch) => updateVersion({ versionId: v.id, ...patch })}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Groups section ─────────────────────────────────────────────────── */}
      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-violet-500" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Release Groups
            </span>
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400">
              {groups.length}
            </span>
          </div>
          <button
            onClick={() => {
              setShowGroupCreate((o) => !o);
              setEditingGroupId(null);
            }}
            className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-600"
          >
            <Plus className="h-3.5 w-3.5" />
            New Group
          </button>
        </div>

        {/* How it works */}
        <div className="mb-3 rounded-xl border border-violet-100 bg-violet-50/40 px-4 py-3 dark:border-violet-900/40 dark:bg-violet-950/20">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-500" />
            <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
              <p>
                <span className="font-semibold text-slate-800 dark:text-slate-100">Release Groups</span>{" "}
                let you combine multiple Jira versions into a single aggregated report. Test results,
                bugs, KPIs, and readiness checks are merged and deduplicated across all member versions.
              </p>
              <p className="text-slate-500 dark:text-slate-400">
                <span className="font-medium text-slate-600 dark:text-slate-300">Example — </span>
                Your team ships in small increments:{" "}
                <span className="rounded bg-violet-100 px-1 font-mono text-[10px] text-violet-700 dark:bg-violet-900/50 dark:text-violet-300">
                  2.1.0
                </span>
                ,{" "}
                <span className="rounded bg-violet-100 px-1 font-mono text-[10px] text-violet-700 dark:bg-violet-900/50 dark:text-violet-300">
                  2.1.1
                </span>
                , and{" "}
                <span className="rounded bg-violet-100 px-1 font-mono text-[10px] text-violet-700 dark:bg-violet-900/50 dark:text-violet-300">
                  2.1.2
                </span>{" "}
                are all part of the same sprint. Create a group called{" "}
                <span className="rounded bg-violet-100 px-1 font-mono text-[10px] text-violet-700 dark:bg-violet-900/50 dark:text-violet-300">
                  Sprint 12
                </span>{" "}
                and select all three — the Report tab will then show a unified view with all their
                executions, bugs, and pass rate combined.
              </p>
              <p className="text-slate-500 dark:text-slate-400">
                Groups are local to QAlity and do not modify anything in Jira.
              </p>
            </div>
          </div>
        </div>

        {/* Create group form */}
        {showGroupCreate && (
          <div className="mb-3 rounded-xl border border-violet-200 bg-violet-50/50 p-4 dark:border-violet-800/60 dark:bg-violet-950/20">
            <p className="mb-3 text-xs font-semibold text-violet-700 dark:text-violet-300">
              New Release Group
            </p>
            <div className="mb-3">
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Group Name <span className="text-red-500">*</span>
              </label>
              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitCreateGroup()}
                placeholder="e.g. Q1 Release"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 outline-none focus:border-violet-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-violet-500"
              />
            </div>
            <div>
              <label className="mb-2 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Versions <span className="text-red-500">*</span>
              </label>
              <div className="max-h-40 overflow-y-auto space-y-1 rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-600 dark:bg-slate-800">
                {versions.map((v) => (
                  <label
                    key={v.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-slate-50 dark:hover:bg-slate-700"
                  >
                    <input
                      type="checkbox"
                      checked={groupVersionIds.includes(v.id)}
                      onChange={(e) => toggleGroupVersion(v.id, e.target.checked)}
                      className="accent-violet-600"
                    />
                    <span className="text-xs text-slate-700 dark:text-slate-200">{v.name}</span>
                    {v.released && (
                      <span className="ml-auto text-[10px] text-emerald-500">Released</span>
                    )}
                    {v.archived && (
                      <span className="ml-auto text-[10px] text-slate-400">Archived</span>
                    )}
                  </label>
                ))}
              </div>
              {groupVersionIds.length > 0 && (
                <p className="mt-1 text-[10px] text-violet-600 dark:text-violet-400">
                  {groupVersionIds.length} version{groupVersionIds.length !== 1 ? "s" : ""} selected
                </p>
              )}
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => setShowGroupCreate(false)}
                className="rounded-lg px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={submitCreateGroup}
                disabled={!groupName.trim() || groupVersionIds.length === 0}
                className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-40 dark:bg-violet-500 dark:hover:bg-violet-600"
              >
                <Plus className="h-3 w-3" />
                Create Group
              </button>
            </div>
          </div>
        )}

        {/* Existing groups */}
        {groups.length === 0 && !showGroupCreate ? (
          <p className="py-4 text-center text-xs text-slate-400 dark:text-slate-500">
            No groups yet. Create one to combine multiple releases into a single report view.
          </p>
        ) : (
          <div className="space-y-2">
            {groups.map((g) =>
              editingGroupId === g.id ? (
                /* Inline edit form */
                <div
                  key={g.id}
                  className="rounded-xl border border-violet-200 bg-violet-50/50 p-4 dark:border-violet-800/60 dark:bg-violet-950/20"
                >
                  <div className="mb-3">
                    <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                      Group Name
                    </label>
                    <input
                      value={editGroupName}
                      onChange={(e) => setEditGroupName(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 outline-none focus:border-violet-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                  <div className="mb-3">
                    <label className="mb-2 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                      Versions
                    </label>
                    <div className="max-h-40 overflow-y-auto space-y-1 rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-600 dark:bg-slate-800">
                      {versions.map((v) => (
                        <label
                          key={v.id}
                          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-slate-50 dark:hover:bg-slate-700"
                        >
                          <input
                            type="checkbox"
                            checked={editGroupVersionIds.includes(v.id)}
                            onChange={(e) => toggleEditGroupVersion(v.id, e.target.checked)}
                            className="accent-violet-600"
                          />
                          <span className="text-xs text-slate-700 dark:text-slate-200">{v.name}</span>
                          {v.released && (
                            <span className="ml-auto text-[10px] text-emerald-500">Released</span>
                          )}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setEditingGroupId(null)}
                      className="rounded-lg px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveEditGroup}
                      disabled={!editGroupName.trim()}
                      className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-40"
                    >
                      <Save className="h-3 w-3" />
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                /* Group row */
                <div
                  key={g.id}
                  className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800/60"
                >
                  <Layers className="h-4 w-4 shrink-0 text-violet-500" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                      {g.name}
                    </p>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {g.versionIds.map((id) => {
                        const v = versions.find((vv) => vv.id === id);
                        return v ? (
                          <span
                            key={id}
                            className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
                          >
                            {v.name}
                          </span>
                        ) : null;
                      })}
                      {g.versionIds.length === 0 && (
                        <span className="text-[10px] text-slate-400">No versions</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => startEditGroup(g)}
                    title="Edit group"
                    className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setPendingDeleteGroupId(g.id)}
                    title="Delete group"
                    className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ),
            )}
          </div>
        )}
      </div>

      <ConfirmModal
        open={pendingDeleteGroup !== null}
        title={`Delete group "${pendingDeleteGroup?.name ?? ""}"?`}
        message="This removes the group from QAlity. No versions or Jira data are affected."
        confirmLabel="Delete Group"
        danger
        onConfirm={() => {
          if (pendingDeleteGroupId) removeVersionGroup(projectKey, pendingDeleteGroupId);
          setPendingDeleteGroupId(null);
        }}
        onCancel={() => setPendingDeleteGroupId(null)}
      />
    </div>
  );
}

function VersionRow({
  version,
  onUpdate,
}: {
  version: JiraVersion;
  onUpdate: (patch: {
    name?: string;
    description?: string;
    released?: boolean;
    archived?: boolean;
    startDate?: string;
    releaseDate?: string;
  }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(version.name);
  const [description, setDescription] = useState(version.description ?? "");
  const [startDate, setStartDate] = useState(version.start_date ?? "");
  const [releaseDate, setReleaseDate] = useState(version.release_date ?? "");
  const [saving, setSaving] = useState(false);
  const [actioning, setActioning] = useState<string | null>(null);

  type PendingAction = {
    patch: Parameters<typeof onUpdate>[0];
    key: string;
    title: string;
    message: string;
    confirmLabel: string;
    danger?: boolean;
  };
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  // Reset local state when version prop changes (after successful update).
  useEffect(() => {
    if (!editing) {
      setName(version.name);
      setDescription(version.description ?? "");
      setStartDate(version.start_date ?? "");
      setReleaseDate(version.release_date ?? "");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  function saveEdit() {
    setSaving(true);
    onUpdate({
      name: name.trim() || version.name,
      description: description.trim(),
      ...(startDate ? { startDate } : {}),
      ...(releaseDate ? { releaseDate } : {}),
    });
    setSaving(false);
    setEditing(false);
  }

  function doAction(patch: Parameters<typeof onUpdate>[0], key: string) {
    setActioning(key);
    onUpdate(patch);
    setTimeout(() => setActioning(null), 1500);
  }

  function confirmAction(action: PendingAction) {
    setPendingAction(action);
  }

  function executeConfirmed() {
    if (!pendingAction) return;
    doAction(pendingAction.patch, pendingAction.key);
    setPendingAction(null);
  }

  const statusBadge = version.archived ? (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400">
      Archived
    </span>
  ) : version.released ? (
    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
      Released
    </span>
  ) : (
    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400">
      Unreleased
    </span>
  );

  const cellClass = "px-4 py-2.5 align-top";
  const inputClass = "w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

  return (
    <>
    <ConfirmModal
      open={pendingAction !== null}
      title={pendingAction?.title ?? ""}
      message={pendingAction?.message ?? ""}
      confirmLabel={pendingAction?.confirmLabel ?? "Confirm"}
      danger={pendingAction?.danger ?? false}
      onConfirm={executeConfirmed}
      onCancel={() => setPendingAction(null)}
    />
    <tr className="bg-white transition-colors hover:bg-slate-50/60 dark:bg-slate-900 dark:hover:bg-slate-800/40">
      <td className={cellClass}>{statusBadge}</td>

      <td className={cellClass}>
        {editing ? (
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        ) : (
          <span className="font-medium text-slate-800 dark:text-slate-100">{version.name}</span>
        )}
      </td>

      <td className={cellClass}>
        {editing ? (
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="—" className={inputClass} />
        ) : (
          <span className="text-slate-500 dark:text-slate-400">{version.description || "—"}</span>
        )}
      </td>

      <td className={cellClass}>
        {editing ? (
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
        ) : (
          <span className="text-slate-500 dark:text-slate-400">{version.start_date ?? "—"}</span>
        )}
      </td>

      <td className={cellClass}>
        {editing ? (
          <input type="date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} className={inputClass} />
        ) : (
          <span className="text-slate-500 dark:text-slate-400">{version.release_date ?? "—"}</span>
        )}
      </td>

      <td className={cn(cellClass, "text-right")}>
        <div className="flex items-center justify-end gap-1">
          {editing ? (
            <>
              <button
                onClick={saveEdit}
                disabled={saving}
                title="Save changes"
                className="rounded p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={() => { setEditing(false); setName(version.name); setDescription(version.description ?? ""); setStartDate(version.start_date ?? ""); setReleaseDate(version.release_date ?? ""); }}
                title="Cancel"
                className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setEditing(true)}
                title="Edit"
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>

              {!version.released && !version.archived && (
                <button
                  onClick={() =>
                    confirmAction({
                      patch: { released: true, releaseDate: releaseDate || new Date().toISOString().split("T")[0]! },
                      key: "release",
                      title: `Release "${version.name}"?`,
                      message: "This will mark the version as released in Jira. All linked issues will reflect the new release status.",
                      confirmLabel: "Release",
                    })
                  }
                  disabled={actioning === "release"}
                  title="Mark as Released"
                  className="rounded p-1 text-emerald-500 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-900/30"
                >
                  {actioning === "release" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PackageCheck className="h-3.5 w-3.5" />}
                </button>
              )}

              {version.released && !version.archived && (
                <button
                  onClick={() =>
                    confirmAction({
                      patch: { released: false },
                      key: "unrelease",
                      title: `Unrelease "${version.name}"?`,
                      message: "This will revert the version back to unreleased in Jira.",
                      confirmLabel: "Unrelease",
                      danger: false,
                    })
                  }
                  disabled={actioning === "unrelease"}
                  title="Unrelease"
                  className="rounded p-1 text-amber-500 hover:bg-amber-50 hover:text-amber-700 dark:hover:bg-amber-900/30"
                >
                  {actioning === "unrelease" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                </button>
              )}

              {!version.archived ? (
                <button
                  onClick={() =>
                    confirmAction({
                      patch: { archived: true },
                      key: "archive",
                      title: `Archive "${version.name}"?`,
                      message: "Archived versions are hidden from most Jira views. You can unarchive it at any time.",
                      confirmLabel: "Archive",
                      danger: true,
                    })
                  }
                  disabled={actioning === "archive"}
                  title="Archive"
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
                >
                  {actioning === "archive" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
                </button>
              ) : (
                <button
                  onClick={() =>
                    confirmAction({
                      patch: { archived: false },
                      key: "unarchive",
                      title: `Unarchive "${version.name}"?`,
                      message: "This will make the version visible again in Jira.",
                      confirmLabel: "Unarchive",
                    })
                  }
                  disabled={actioning === "unarchive"}
                  title="Unarchive"
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
                >
                  {actioning === "unarchive" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                </button>
              )}
            </>
          )}
        </div>
      </td>
    </tr>
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function VersionsPage() {
  const executionProjectKey = useExecutionProjectKey();
  const queryClient = useQueryClient();
  const {
    favourites,
    isFavourite,
    toggleFavourite,
    selectedVersionId: selectedVersionIdMap,
    setSelectedVersionId,
    healthDots,
    setHealthDot,
    versionGroups,
  } = useVersionsStore();

  const {
    data: versions,
    isLoading: versionsLoading,
    isError: versionsError,
    error: versionsErr,
  } = useProjectVersions(executionProjectKey);

  // Derive the selected JiraVersion object from the persisted ID once versions load.
  const storedVersionId = executionProjectKey
    ? (selectedVersionIdMap[executionProjectKey] ?? null)
    : null;
  const selectedVersion = (versions ?? []).find((v) => v.id === storedVersionId) ?? null;

  // Health dot map for the current project (persisted across navigations / reloads).
  const healthDotMap: Record<string, "green" | "amber" | "red"> =
    (executionProjectKey && healthDots[executionProjectKey]) || {};

  const [selectedExecution, setSelectedExecution] = useState<TestExecution | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [versionFilter, setVersionFilter] = useState("");
  const [showReleased, setShowReleased] = useState(false);
  const [activeTab, setActiveTab] = useState<"report" | "manage">("report");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const projectGroups = executionProjectKey ? (versionGroups[executionProjectKey] ?? []) : [];
  const selectedGroup = projectGroups.find((g) => g.id === selectedGroupId) ?? null;

  const handleBack = () => setSelectedExecution(null);

  const handleSelectVersion = useCallback(
    (id: string) => {
      if (executionProjectKey) setSelectedVersionId(executionProjectKey, id);
      setSelectedGroupId(null);
      setSelectedExecution(null);
    },
    [executionProjectKey, setSelectedVersionId],
  );

  const handleSelectGroup = useCallback((id: string) => {
    setSelectedGroupId(id);
    if (executionProjectKey) setSelectedVersionId(executionProjectKey, null);
    setSelectedExecution(null);
  }, [executionProjectKey, setSelectedVersionId]);

  const handleReload = useCallback(async () => {
    if (!executionProjectKey) return;
    setIsRefreshing(true);
    const versionList = versions ?? [];
    const groupVersionNames = selectedGroup
      ? selectedGroup.versionIds
          .map((id) => versionList.find((v) => v.id === id)?.name)
          .filter(Boolean) as string[]
      : [];

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
            queryClient.invalidateQueries({
              queryKey: queryKeys.versionIssues(executionProjectKey, selectedVersion.name),
            }),
          ]
        : []),
      ...groupVersionNames.flatMap((name) => [
        queryClient.invalidateQueries({
          queryKey: queryKeys.bugsByVersion(executionProjectKey, name),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.testExecutionsByVersion(executionProjectKey, name),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.versionIssues(executionProjectKey, name),
        }),
      ]),
    ];
    await Promise.all(toInvalidate);
    setIsRefreshing(false);
  }, [executionProjectKey, selectedVersion, selectedGroup, versions, queryClient]);

  // Derived version lists — must be declared before early returns (rules of hooks).
  const allVersions = useMemo(() => versions ?? [], [versions]);
  const filterQ = versionFilter.trim().toLowerCase();
  const favouriteVersions = useMemo(
    () =>
      allVersions.filter(
        (v) =>
          executionProjectKey &&
          isFavourite(executionProjectKey, v.id) &&
          (!filterQ || v.name.toLowerCase().includes(filterQ)),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allVersions, executionProjectKey, favourites, filterQ],
  );
  const unreleasedVersions = useMemo(
    () =>
      allVersions.filter(
        (v) =>
          !v.archived &&
          !v.released &&
          !(executionProjectKey && isFavourite(executionProjectKey, v.id)) &&
          (!filterQ || v.name.toLowerCase().includes(filterQ)),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allVersions, executionProjectKey, favourites, filterQ],
  );
  const releasedVersions = useMemo(
    () =>
      allVersions.filter(
        (v) =>
          !v.archived &&
          v.released &&
          !(executionProjectKey && isFavourite(executionProjectKey, v.id)) &&
          (!filterQ || v.name.toLowerCase().includes(filterQ)),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allVersions, executionProjectKey, favourites, filterQ],
  );
  const archivedVersions = useMemo(
    () =>
      allVersions.filter(
        (v) =>
          v.archived &&
          !(executionProjectKey && isFavourite(executionProjectKey, v.id)) &&
          (!filterQ || v.name.toLowerCase().includes(filterQ)),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allVersions, executionProjectKey, favourites, filterQ],
  );

  const handleToggleFavourite = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      if (!executionProjectKey) return;
      toggleFavourite(executionProjectKey, id);
    },
    [executionProjectKey, toggleFavourite],
  );

  const handleHealthUpdate = useCallback(
    (id: string, dot: "green" | "amber" | "red") => {
      if (executionProjectKey) setHealthDot(executionProjectKey, id, dot);
    },
    [executionProjectKey, setHealthDot],
  );

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
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading project versions…</span>
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

  if (allVersions.length === 0) {
    return <EmptyState icon={Tag} message="No versions found for this project." />;
  }

  if (selectedExecution) {
    return <TestExecutionDetail execution={selectedExecution} onBack={handleBack} />;
  }

  return (
    <div className="flex h-full gap-6">
      {/* Sidebar — version list */}
      <div className="w-72 shrink-0 space-y-1 overflow-y-auto">
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

        {/* Filter input */}
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Filter versions…"
            value={versionFilter}
            onChange={(e) => setVersionFilter(e.target.value)}
            className="w-full rounded-md border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus:border-slate-500"
          />
          {versionFilter && (
            <button
              onClick={() => setVersionFilter("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              aria-label="Clear filter"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Groups */}
        {projectGroups.length > 0 && (
          <>
            <div className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-violet-500">
              <Layers className="h-3 w-3" />
              Groups
            </div>
            <div className="space-y-1">
              {projectGroups.map((g) => (
                <VersionGroupCard
                  key={g.id}
                  group={g}
                  versions={allVersions}
                  isActive={selectedGroup?.id === g.id}
                  onClick={handleSelectGroup}
                />
              ))}
            </div>
            <div className="my-2 border-t border-slate-100 dark:border-slate-700" />
          </>
        )}

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
                  onClick={handleSelectVersion}
                  onToggleFavourite={handleToggleFavourite}
                  {...(healthDotMap[v.id] ? { healthDot: healthDotMap[v.id] } : {})}
                />
              ))}
            </div>
            {(unreleasedVersions.length > 0 ||
              releasedVersions.length > 0 ||
              archivedVersions.length > 0) && (
              <div className="my-2 border-t border-slate-100 dark:border-slate-700" />
            )}
          </>
        )}

        {unreleasedVersions.length > 0 && (
          <div className="space-y-1">
            {unreleasedVersions.map((v) => (
              <VersionCard
                key={v.id}
                version={v}
                isActive={selectedVersion?.id === v.id}
                isFavourite={false}
                onClick={handleSelectVersion}
                onToggleFavourite={handleToggleFavourite}
                {...(healthDotMap[v.id] ? { healthDot: healthDotMap[v.id] } : {})}
              />
            ))}
          </div>
        )}

        {/* Released versions — hidden by default */}
        <div className={cn(unreleasedVersions.length > 0 && "mt-3")}>
          <button
            onClick={() => setShowReleased((s) => !s)}
            className="flex w-full items-center justify-between rounded px-1 py-0.5 text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
          >
            <span className="flex items-center gap-1">
              <CheckCircle className="h-3 w-3" />
              Released ({releasedVersions.length})
            </span>
            <ChevronDown
              className={cn(
                "h-3 w-3 transition-transform duration-200",
                showReleased && "rotate-180",
              )}
            />
          </button>
          {showReleased && releasedVersions.length > 0 && (
            <div className="mt-1 space-y-1">
              {releasedVersions.map((v) => (
                <VersionCard
                  key={v.id}
                  version={v}
                  isActive={selectedVersion?.id === v.id}
                  isFavourite={false}
                  onClick={handleSelectVersion}
                  onToggleFavourite={handleToggleFavourite}
                  {...(healthDotMap[v.id] ? { healthDot: healthDotMap[v.id] } : {})}
                />
              ))}
            </div>
          )}
        </div>

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
                  onClick={handleSelectVersion}
                  onToggleFavourite={handleToggleFavourite}
                  {...(healthDotMap[v.id] ? { healthDot: healthDotMap[v.id] } : {})}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Tab bar */}
        <div className="mb-4 flex shrink-0 items-center gap-1 border-b border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setActiveTab("report")}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-3 pb-2.5 text-xs font-medium transition-colors",
              activeTab === "report"
                ? "border-indigo-500 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200",
            )}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Report
          </button>
          <button
            onClick={() => setActiveTab("manage")}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-3 pb-2.5 text-xs font-medium transition-colors",
              activeTab === "manage"
                ? "border-indigo-500 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200",
            )}
          >
            <Layers className="h-3.5 w-3.5" />
            Manage Versions
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {activeTab === "report" ? (
            selectedGroup ? (
              <GroupReportPanel
                group={selectedGroup}
                projectKey={executionProjectKey}
                versions={allVersions}
                onSelectExecution={setSelectedExecution}
                onReload={handleReload}
                isRefreshing={isRefreshing}
                onHealthUpdate={handleHealthUpdate}
              />
            ) : !selectedVersion ? (
              <div className="flex h-48 flex-col items-center justify-center gap-2 text-slate-400 dark:text-slate-500">
                <Tag className="h-8 w-8 opacity-40" />
                <p className="text-sm">Select a version or group to view its report.</p>
              </div>
            ) : (
              <ExecutionListPanel
                projectKey={executionProjectKey}
                version={selectedVersion}
                onSelectExecution={setSelectedExecution}
                onReload={handleReload}
                isRefreshing={isRefreshing}
                onHealthUpdate={handleHealthUpdate}
              />
            )
          ) : (
            <ManageVersionsTab
              projectKey={executionProjectKey}
              versions={allVersions}
            />
          )}
        </div>
      </div>
    </div>
  );
}
