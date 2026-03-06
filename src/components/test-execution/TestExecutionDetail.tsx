import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  useTestRuns,
  useUpdateTestRunStatus,
  useUpdateTestRunComment,
  useUpdateTestRunStepStatus,
  useUpdateTestRunStep,
  useXrayStatuses,
  useStepStatuses,
  useTestSetMembership,
} from "@/services/queries";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Badge, statusVariant } from "@/components/ui/badge";
import { cn } from "@/components/ui/utils";
import {
  ArrowLeft,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Layers,
  Loader2,
  MessageSquare,
  Pencil,
} from "lucide-react";
import type {
  TestExecution,
  TestRun,
  TestRunStep,
  XrayStepStatus,
  XrayTestRunStatus,
} from "@/types";

interface TestExecutionDetailProps {
  execution: TestExecution;
  onBack: () => void;
  /** Project key used to fetch test sets for the filter (content project key). */
  contentProjectKey?: string | null;
}

/** Returns an inline style object for a status button given an optional hex color. */
function statusButtonStyle(color: string | undefined, isActive: boolean): React.CSSProperties {
  if (!color) return {};
  return isActive
    ? { backgroundColor: color, color: "#fff", borderColor: color }
    : { backgroundColor: `${color}22`, color, borderColor: `${color}55` };
}

/** Fallback status names shown while Xray statuses are loading. */
const FALLBACK_STATUSES: XrayTestRunStatus[] = [
  { name: "TODO" },
  { name: "EXECUTING" },
  { name: "PASS" },
  { name: "FAIL" },
  { name: "BLOCKED" },
];

const FALLBACK_STEP_STATUSES: XrayStepStatus[] = [
  { name: "TODO" },
  { name: "PASS" },
  { name: "FAIL" },
];

/** Sentinel value meaning "show all runs regardless of test set". */
const FILTER_ALL = "__all__";
/** Sentinel value meaning "show only runs whose test is in no test set". */
const FILTER_NONE = "__none__";

export function TestExecutionDetail({
  execution,
  onBack,
  contentProjectKey,
}: TestExecutionDetailProps) {
  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useTestRuns(execution.issue_id);
  const { data: xrayStatuses } = useXrayStatuses(execution.project_id);
  const { data: xrayStepStatuses } = useStepStatuses(execution.project_id);
  const updateStatus = useUpdateTestRunStatus();
  const updateComment = useUpdateTestRunComment();
  const updateStepStatus = useUpdateTestRunStepStatus();
  const updateStep = useUpdateTestRunStep();

  // Test-set membership data for the filter
  const { testSets, membership } = useTestSetMembership(contentProjectKey ?? null);

  const [activeComment, setActiveComment] = useState<string | null>(null);
  const [commentValue, setCommentValue] = useState("");
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());
  const [testSetFilter, setTestSetFilter] = useState<string>(FILTER_ALL);
  const parentRef = useRef<HTMLDivElement>(null);

  // Flatten all pages into a single runs array
  const runs = useMemo(() => data?.pages.flatMap((page) => page.results) ?? [], [data]);

  // Apply test-set filter
  const filteredRuns = useMemo(() => {
    if (testSetFilter === FILTER_ALL) return runs;
    if (testSetFilter === FILTER_NONE)
      return runs.filter((r) => !membership.has(r.test.issue_id));
    return runs.filter((r) => {
      const sets = membership.get(r.test.issue_id);
      return sets?.some((s) => s.issueId === testSetFilter) ?? false;
    });
  }, [runs, testSetFilter, membership]);

  // Total count from the server (available from the first page)
  const totalFromServer = data?.pages[0]?.total ?? 0;

  const statuses: XrayTestRunStatus[] =
    xrayStatuses && xrayStatuses.length > 0 ? xrayStatuses : FALLBACK_STATUSES;

  const stepStatuses: XrayStepStatus[] =
    xrayStepStatuses && xrayStepStatuses.length > 0 ? xrayStepStatuses : FALLBACK_STEP_STATUSES;

  const toggleExpanded = (runId: string) => {
    setExpandedRuns((prev) => {
      const next = new Set(prev);
      if (next.has(runId)) {
        next.delete(runId);
      } else {
        next.add(runId);
      }
      return next;
    });
  };

  const virtualizer = useVirtualizer({
    count: filteredRuns.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 10,
  });

  // Auto-load next page when the user scrolls near the bottom
  const virtualItems = virtualizer.getVirtualItems();
  useEffect(() => {
    const lastItem = virtualItems[virtualItems.length - 1];
    if (!lastItem) return;

    // If the last visible item is within 5 rows of the end, fetch more
    if (lastItem.index >= runs.length - 5 && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [virtualItems, hasNextPage, isFetchingNextPage, runs.length, fetchNextPage]);

  const handleStatusChange = (run: TestRun, newStatus: string) => {
    updateStatus.mutate({
      testRunId: run.id,
      status: newStatus,
      executionIssueId: execution.issue_id,
    });
  };

  const handleStepStatusChange = (run: TestRun, step: TestRunStep, newStatus: string) => {
    updateStepStatus.mutate({
      testRunId: run.id,
      stepId: step.id,
      status: newStatus,
      executionIssueId: execution.issue_id,
    });
  };

  const handleSaveComment = (run: TestRun) => {
    updateComment.mutate({
      testRunId: run.id,
      comment: commentValue,
      executionIssueId: execution.issue_id,
    });
    setActiveComment(null);
    setCommentValue("");
  };

  const handleSaveStepField = useCallback(
    (run: TestRun, step: TestRunStep, field: "comment" | "actualResult", value: string) => {
      updateStep.mutate({
        testRunId: run.id,
        stepId: step.id,
        [field]: value,
        executionIssueId: execution.issue_id,
      });
    },
    [updateStep, execution.issue_id],
  );

  // ── Bulk operations ─────────────────────────────────────────────────────────

  const handleBulkRunStatus = (newStatus: string) => {
    // Bulk operates only on the currently visible (filtered) runs.
    for (const run of filteredRuns) {
      if (run.status.name.toUpperCase() !== newStatus.toUpperCase()) {
        updateStatus.mutate({
          testRunId: run.id,
          status: newStatus,
          executionIssueId: execution.issue_id,
        });
      }
    }
  };

  const handleBulkStepStatus = (run: TestRun, newStatus: string) => {
    if (!run.steps) return;
    for (const step of run.steps) {
      if (step.status?.name?.toUpperCase() !== newStatus.toUpperCase()) {
        updateStepStatus.mutate({
          testRunId: run.id,
          stepId: step.id,
          status: newStatus,
          executionIssueId: execution.issue_id,
        });
      }
    }
  };

  // ── Progress summary (over filtered runs) ──────────────────────────────────
  const total = filteredRuns.length;
  const counts = filteredRuns.reduce<Record<string, number>>((acc, run) => {
    const name = run.status.name.toUpperCase();
    acc[name] = (acc[name] ?? 0) + 1;
    return acc;
  }, {});
  const passed = counts["PASS"] ?? counts["PASSED"] ?? 0;
  const failed = counts["FAIL"] ?? counts["FAILED"] ?? 0;
  const blocked = counts["BLOCKED"] ?? 0;
  const executing = counts["EXECUTING"] ?? 0;
  const todo = total - passed - failed - blocked - executing;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-4 flex items-start gap-3">
        <button
          onClick={onBack}
          className="mt-0.5 rounded p-1 hover:bg-slate-100"
          aria-label="Back to executions"
        >
          <ArrowLeft className="h-4 w-4 text-slate-500" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">{execution.jira.summary}</h1>
          <p className="mt-0.5 font-mono text-xs text-slate-400">{execution.jira.key}</p>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex h-48 flex-col items-center justify-center gap-3 text-slate-400">
          <Spinner />
          <p className="text-sm">Loading test runs...</p>
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          <p className="mb-1 font-medium">Failed to load test runs</p>
          <pre className="whitespace-pre-wrap break-words font-mono text-xs">{String(error)}</pre>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && runs.length === 0 && (
        <div className="flex h-48 flex-col items-center justify-center gap-3 text-slate-400">
          <ClipboardList className="h-10 w-10 opacity-40" />
          <p className="text-sm">No test runs in this execution.</p>
        </div>
      )}

      {runs.length > 0 && (
        <>
          {/* Test Set filter */}
          {testSets.length > 0 && (
            <div className="mb-3 flex items-center gap-2">
              <Layers className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="text-xs font-medium text-slate-500">Filter by Test Set:</span>
              <select
                value={testSetFilter}
                onChange={(e) => setTestSetFilter(e.target.value)}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              >
                <option value={FILTER_ALL}>All tests ({runs.length})</option>
                <option value={FILTER_NONE}>
                  No test set ({runs.filter((r) => !membership.has(r.test.issue_id)).length})
                </option>
                {testSets.map((ts) => {
                  const count = runs.filter((r) =>
                    membership.get(r.test.issue_id)?.some((s) => s.issueId === ts.issue_id),
                  ).length;
                  return (
                    <option key={ts.issue_id} value={ts.issue_id}>
                      {ts.jira.key} — {ts.jira.summary} ({count})
                    </option>
                  );
                })}
              </select>
              {testSetFilter !== FILTER_ALL && (
                <button
                  onClick={() => setTestSetFilter(FILTER_ALL)}
                  className="text-xs text-slate-400 hover:text-slate-600 underline"
                >
                  Clear
                </button>
              )}
            </div>
          )}

          {/* Progress summary */}
          <div className="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
              <span className="font-medium">
                {total}
                {totalFromServer > total ? ` of ${totalFromServer}` : ""} test
                {totalFromServer !== 1 ? "s" : ""}
              </span>
              <span className="text-slate-400">
                {passed} passed · {failed} failed · {blocked} blocked · {executing} executing ·{" "}
                {todo} todo
              </span>
            </div>
            {/* Progress bar */}
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
              {passed > 0 && (
                <div className="bg-emerald-500" style={{ width: `${(passed / total) * 100}%` }} />
              )}
              {executing > 0 && (
                <div className="bg-blue-400" style={{ width: `${(executing / total) * 100}%` }} />
              )}
              {blocked > 0 && (
                <div className="bg-amber-400" style={{ width: `${(blocked / total) * 100}%` }} />
              )}
              {failed > 0 && (
                <div className="bg-red-500" style={{ width: `${(failed / total) * 100}%` }} />
              )}
            </div>
          </div>

          {/* Bulk actions */}
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Set all:</span>
            {statuses.map((s) => (
              <button
                key={s.name}
                title={`Mark all test runs as ${s.name}`}
                onClick={() => handleBulkRunStatus(s.name)}
                disabled={updateStatus.isPending}
                style={statusButtonStyle(s.color, false)}
                className={cn(
                  "rounded border px-2 py-0.5 text-xs font-medium transition-colors",
                  !s.color && "border-transparent bg-slate-100 text-slate-600 hover:bg-slate-200",
                )}
              >
                {s.name}
              </button>
            ))}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            {/* Table header */}
            <div className="grid grid-cols-[auto_2fr_1fr_auto_auto] gap-4 border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-slate-500">
              <span className="w-5"></span>
              <span>Test</span>
              <span>Status</span>
              <span>Update status</span>
              <span></span>
            </div>

            {/* Virtualised rows */}
            <div
              ref={parentRef}
              className="overflow-auto"
              style={{ height: Math.min(filteredRuns.length * 56, 600) }}
            >
              <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
                {virtualItems.map((virtualRow) => {
                  const run = filteredRuns[virtualRow.index];
                  if (!run) return null;

                  const hasSteps = run.steps && run.steps.length > 0;
                  const isExpanded = expandedRuns.has(run.id);

                  return (
                    <div
                      key={run.id}
                      data-index={virtualRow.index}
                      ref={virtualizer.measureElement}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <div className="grid grid-cols-[auto_2fr_1fr_auto_auto] items-center gap-4 border-b border-slate-50 px-4 py-3 last:border-0 hover:bg-slate-50/50">
                        {/* Expand toggle */}
                        <button
                          onClick={() => hasSteps && toggleExpanded(run.id)}
                          className={cn(
                            "flex h-5 w-5 items-center justify-center rounded",
                            hasSteps
                              ? "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                              : "cursor-default text-transparent",
                          )}
                          aria-label={isExpanded ? "Collapse steps" : "Expand steps"}
                          tabIndex={hasSteps ? 0 : -1}
                          onKeyDown={(e) => {
                            if (hasSteps && (e.key === "Enter" || e.key === " ")) {
                              e.preventDefault();
                              toggleExpanded(run.id);
                            }
                          }}
                        >
                          {hasSteps &&
                            (isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            ))}
                        </button>

                        {/* Test identity */}
                        <div className="min-w-0">
                          <p className="truncate text-sm text-slate-800">{run.test.jira.summary}</p>
                          <p className="font-mono text-xs text-slate-400">
                            {run.test.jira.key}
                            {hasSteps && (
                              <span className="ml-2 text-slate-300">
                                {run.steps!.length} step{run.steps!.length !== 1 ? "s" : ""}
                              </span>
                            )}
                          </p>
                        </div>

                        {/* Current status */}
                        <Badge variant={statusVariant(run.status.name)}>{run.status.name}</Badge>

                        {/* Status quick-actions (dynamic) */}
                        <div className="flex flex-wrap items-center gap-1">
                          {statuses.map((s) => {
                            const isActive = run.status.name.toUpperCase() === s.name.toUpperCase();
                            return (
                              <button
                                key={s.name}
                                title={s.description ?? s.name}
                                disabled={updateStatus.isPending}
                                onClick={() => handleStatusChange(run, s.name)}
                                style={statusButtonStyle(s.color, isActive)}
                                className={cn(
                                  "rounded border px-2 py-0.5 text-xs font-medium transition-colors",
                                  !s.color &&
                                    (isActive
                                      ? "border-transparent bg-slate-800 text-white"
                                      : "border-transparent bg-slate-100 text-slate-600 hover:bg-slate-200"),
                                )}
                              >
                                {s.name}
                              </button>
                            );
                          })}
                        </div>

                        {/* Comment toggle */}
                        <button
                          title={run.comment ? `Comment: ${run.comment}` : "Add comment"}
                          onClick={() => {
                            if (activeComment === run.id) {
                              setActiveComment(null);
                            } else {
                              setActiveComment(run.id);
                              setCommentValue(run.comment ?? "");
                            }
                          }}
                          className={cn(
                            "rounded p-1 hover:bg-slate-100",
                            run.comment
                              ? "text-blue-500 hover:text-blue-700"
                              : "text-slate-400 hover:text-slate-700",
                          )}
                        >
                          <MessageSquare className="h-4 w-4" />
                        </button>
                      </div>

                      {/* Inline comment editor */}
                      {activeComment === run.id && (
                        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2">
                          <input
                            autoFocus
                            className="flex-1 rounded border border-slate-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                            placeholder="Add a comment..."
                            value={commentValue}
                            onChange={(e) => setCommentValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveComment(run);
                              if (e.key === "Escape") setActiveComment(null);
                            }}
                          />
                          <Button
                            size="sm"
                            disabled={updateComment.isPending}
                            onClick={() => handleSaveComment(run)}
                          >
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setActiveComment(null)}>
                            Cancel
                          </Button>
                        </div>
                      )}

                      {/* Expanded steps panel */}
                      {isExpanded && hasSteps && (
                        <StepsPanel
                          run={run}
                          steps={run.steps!}
                          stepStatuses={stepStatuses}
                          onStepStatusChange={(step, status) =>
                            handleStepStatusChange(run, step, status)
                          }
                          onSaveStepField={(step, field, value) =>
                            handleSaveStepField(run, step, field, value)
                          }
                          onBulkStepStatus={(status) => handleBulkStepStatus(run, status)}
                          isPending={updateStepStatus.isPending}
                          isSaving={updateStep.isPending}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer with count + load more */}
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
              <span>
                {testSetFilter !== FILTER_ALL
                  ? `${filteredRuns.length} of ${runs.length}`
                  : runs.length}
                {testSetFilter === FILTER_ALL && totalFromServer > runs.length
                  ? ` of ${totalFromServer}`
                  : ""}{" "}
                test{totalFromServer !== 1 ? "s" : ""}
              </span>
              {hasNextPage && (
                <button
                  onClick={() => void fetchNextPage()}
                  disabled={isFetchingNextPage}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                >
                  {isFetchingNextPage ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    "Load more"
                  )}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Steps Panel ───────────────────────────────────────────────────────────────

interface StepsPanelProps {
  run: TestRun;
  steps: TestRunStep[];
  stepStatuses: XrayStepStatus[];
  onStepStatusChange: (step: TestRunStep, status: string) => void;
  onSaveStepField: (step: TestRunStep, field: "comment" | "actualResult", value: string) => void;
  onBulkStepStatus: (status: string) => void;
  isPending: boolean;
  isSaving: boolean;
}

function StepsPanel({
  steps,
  stepStatuses,
  onStepStatusChange,
  onSaveStepField,
  onBulkStepStatus,
  isPending,
  isSaving,
}: StepsPanelProps) {
  const [editingStep, setEditingStep] = useState<{
    stepId: string;
    field: "comment" | "actualResult";
  } | null>(null);
  const [editValue, setEditValue] = useState("");
  const stepRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const startEditing = (step: TestRunStep, field: "comment" | "actualResult") => {
    setEditingStep({ stepId: step.id, field });
    setEditValue(field === "comment" ? (step.comment ?? "") : (step.actual_result ?? ""));
  };

  const saveAndClose = (step: TestRunStep) => {
    if (editingStep) {
      onSaveStepField(step, editingStep.field, editValue);
      setEditingStep(null);
      setEditValue("");
    }
  };

  const cancelEditing = () => {
    setEditingStep(null);
    setEditValue("");
  };

  // Keyboard navigation between steps
  const handleStepKeyDown = (e: React.KeyboardEvent, index: number) => {
    let targetIndex: number | null = null;
    if (e.key === "ArrowDown" || e.key === "j") {
      targetIndex = Math.min(index + 1, steps.length - 1);
    } else if (e.key === "ArrowUp" || e.key === "k") {
      targetIndex = Math.max(index - 1, 0);
    }
    if (targetIndex !== null && targetIndex !== index) {
      e.preventDefault();
      const targetStep = steps[targetIndex];
      if (targetStep) {
        const el = stepRefs.current.get(targetStep.id);
        el?.focus();
      }
    }
  };

  return (
    <div className="border-b border-slate-100 bg-slate-50/60">
      <div className="px-6 py-2">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Steps ({steps.length})
          </p>
          {/* Bulk step actions */}
          <div className="flex items-center gap-1">
            <CheckCheck className="mr-1 h-3 w-3 text-slate-400" />
            {stepStatuses.map((s) => (
              <button
                key={s.name}
                title={`Mark all steps as ${s.name}`}
                onClick={() => onBulkStepStatus(s.name)}
                disabled={isPending}
                style={statusButtonStyle(s.color, false)}
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                  !s.color && "border-transparent bg-slate-100 text-slate-600 hover:bg-slate-200",
                )}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          {steps.map((step, index) => {
            const currentStatus = step.status?.name?.toUpperCase() ?? "";
            const isEditingComment =
              editingStep?.stepId === step.id && editingStep.field === "comment";
            const isEditingActual =
              editingStep?.stepId === step.id && editingStep.field === "actualResult";

            return (
              <div
                key={step.id}
                ref={(el) => {
                  if (el) {
                    stepRefs.current.set(step.id, el);
                  } else {
                    stepRefs.current.delete(step.id);
                  }
                }}
                tabIndex={0}
                role="row"
                aria-label={`Step ${index + 1}: ${step.action ?? "No action"}`}
                onKeyDown={(e) => handleStepKeyDown(e, index)}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-400"
              >
                <div className="flex items-start gap-3">
                  {/* Step number */}
                  <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-medium text-slate-500">
                    {index + 1}
                  </span>

                  {/* Step content */}
                  <div className="min-w-0 flex-1">
                    {step.action && <p className="text-sm text-slate-700">{step.action}</p>}
                    {step.data && (
                      <p className="mt-0.5 text-xs text-slate-400">
                        <span className="font-medium text-slate-500">Data: </span>
                        {step.data}
                      </p>
                    )}
                    {step.result && (
                      <p className="mt-0.5 text-xs text-slate-400">
                        <span className="font-medium text-slate-500">Expected: </span>
                        {step.result}
                      </p>
                    )}

                    {/* Actual result — editable */}
                    {isEditingActual ? (
                      <div className="mt-1 flex items-center gap-1">
                        <input
                          autoFocus
                          className="flex-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-slate-400"
                          placeholder="Actual result..."
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveAndClose(step);
                            if (e.key === "Escape") cancelEditing();
                            e.stopPropagation();
                          }}
                        />
                        <Button
                          size="sm"
                          className="h-6 px-2 text-xs"
                          disabled={isSaving}
                          onClick={() => saveAndClose(step)}
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-xs"
                          onClick={cancelEditing}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <p
                        className="mt-0.5 group flex cursor-pointer items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
                        onClick={() => startEditing(step, "actualResult")}
                      >
                        <span className="font-medium text-slate-500">Actual: </span>
                        {step.actual_result || (
                          <span className="italic text-slate-300">click to add</span>
                        )}
                        <Pencil className="ml-1 hidden h-3 w-3 group-hover:inline-block" />
                      </p>
                    )}

                    {/* Comment — editable */}
                    {isEditingComment ? (
                      <div className="mt-1 flex items-center gap-1">
                        <input
                          autoFocus
                          className="flex-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-slate-400"
                          placeholder="Step comment..."
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveAndClose(step);
                            if (e.key === "Escape") cancelEditing();
                            e.stopPropagation();
                          }}
                        />
                        <Button
                          size="sm"
                          className="h-6 px-2 text-xs"
                          disabled={isSaving}
                          onClick={() => saveAndClose(step)}
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-xs"
                          onClick={cancelEditing}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <p
                        className="mt-0.5 group flex cursor-pointer items-center gap-1 text-xs italic text-slate-400 hover:text-slate-600"
                        onClick={() => startEditing(step, "comment")}
                      >
                        {step.comment || (
                          <span className="not-italic text-slate-300">add comment...</span>
                        )}
                        <Pencil className="ml-1 hidden h-3 w-3 group-hover:inline-block" />
                      </p>
                    )}
                  </div>

                  {/* Step status + buttons */}
                  <div className="flex flex-shrink-0 items-center gap-1.5">
                    {step.status && (
                      <Badge variant={statusVariant(step.status.name)} className="mr-1 text-[10px]">
                        {step.status.name}
                      </Badge>
                    )}
                    {stepStatuses.map((s) => {
                      const isActive = currentStatus === s.name.toUpperCase();
                      return (
                        <button
                          key={s.name}
                          title={s.description ?? s.name}
                          disabled={isPending}
                          onClick={() => onStepStatusChange(step, s.name)}
                          style={statusButtonStyle(s.color, isActive)}
                          className={cn(
                            "rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                            !s.color &&
                              (isActive
                                ? "border-transparent bg-slate-800 text-white"
                                : "border-transparent bg-slate-100 text-slate-600 hover:bg-slate-200"),
                          )}
                        >
                          {s.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
