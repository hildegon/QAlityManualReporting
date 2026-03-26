import { useState, useEffect, useRef } from "react";
import {
  CheckCheck,
  TrendingDown,
  Shuffle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Link,
  Bug,
} from "lucide-react";
import { findSlice } from "@/components/charts/status-utils";
import { useLinkBugToTest } from "@/services/queries";
import type { TestRunHistory } from "@/services/queries";
import { cn } from "@/components/ui/utils";
import { priorityClass } from "./utils";
import { TestDetailModal } from "./TestDetailModal";
import type { JiraBug } from "@/types";

// ── Classification metadata ────────────────────────────────────────────────────

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

// ── StatusPip ──────────────────────────────────────────────────────────────────

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

// ── FailedTestRow ──────────────────────────────────────────────────────────────

interface FailedTestRowProps {
  test: TestRunHistory;
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
  const [previewOpen, setPreviewOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const linkBug = useLinkBugToTest();

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

  const unlinkedBugs = linkableBugs.filter((b) => !test.linkedBugKeys.includes(b.key));

  function handleLinkBug(bugKey: string) {
    setPickerOpen(false);
    linkBug.mutate({ bugKey, testKey: test.testKey, linkTypeName, projectKey, versionName });
  }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setPreviewOpen(true)}
        onKeyDown={(e) => e.key === "Enter" && setPreviewOpen(true)}
        className="cursor-pointer rounded-lg border border-slate-200 bg-white px-4 py-3 transition-colors hover:border-amber-400 hover:bg-amber-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-amber-600 dark:hover:bg-amber-950/40"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium text-sm text-slate-900 dark:text-slate-200">
              {test.testSummary}
            </p>
            <p className="mt-0.5 font-mono text-xs text-slate-400">{test.testKey}</p>
          </div>
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

            {linkableBugs.length > 0 && (
              <div
                className="relative"
                ref={pickerRef}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
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

        {linkBug.isError && (
          <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">
            Failed to link bug: {linkBug.error ?? "Unknown error"}
          </p>
        )}
      </div>

      {previewOpen && (
        <TestDetailModal
          testKey={test.testKey}
          projectKey={projectKey}
          versionName={versionName}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </>
  );
}

// ── FailedTestsAnalysis ────────────────────────────────────────────────────────

interface FailedTestsAnalysisProps {
  failedTests: TestRunHistory[];
  isLoading: boolean;
  linkableBugs: JiraBug[];
  linkTypeName: string;
  projectKey: string;
  versionName: string;
}

export function FailedTestsAnalysis({
  failedTests,
  isLoading,
  linkableBugs,
  linkTypeName,
  projectKey,
  versionName,
}: FailedTestsAnalysisProps) {
  const [showAll, setShowAll] = useState(false);
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

  const byClass = failedTests.reduce<Record<string, number>>((acc, t) => {
    acc[t.classification] = (acc[t.classification] ?? 0) + 1;
    return acc;
  }, {});

  const PREVIEW_COUNT = 5;
  const visible = showAll ? failedTests : failedTests.slice(0, PREVIEW_COUNT);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
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
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200",
              collapsed && "-rotate-90",
            )}
          />
        </div>
      </button>

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
