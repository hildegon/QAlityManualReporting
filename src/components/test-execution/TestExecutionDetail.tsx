import { useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  useTestRuns,
  useUpdateTestRunStatus,
  useUpdateTestRunComment,
  useUpdateTestRunStepStatus,
  useXrayStatuses,
  useStepStatuses,
} from "@/services/queries";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Badge, statusVariant } from "@/components/ui/badge";
import { cn } from "@/components/ui/utils";
import { ArrowLeft, ChevronDown, ChevronRight, MessageSquare } from "lucide-react";
import type { TestExecution, TestRun, TestRunStep, XrayStepStatus, XrayTestRunStatus } from "@/types";

interface TestExecutionDetailProps {
  execution: TestExecution;
  onBack: () => void;
}

/** Returns an inline style object for a status button given an optional hex color. */
function statusButtonStyle(
  color: string | undefined,
  isActive: boolean,
): React.CSSProperties {
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

export function TestExecutionDetail({ execution, onBack }: TestExecutionDetailProps) {
  const { data: runs, isLoading, isError, error } = useTestRuns(execution.issue_id);
  const { data: xrayStatuses } = useXrayStatuses(execution.project_id);
  const { data: xrayStepStatuses } = useStepStatuses(execution.project_id);
  const updateStatus = useUpdateTestRunStatus();
  const updateComment = useUpdateTestRunComment();
  const updateStepStatus = useUpdateTestRunStepStatus();

  const [activeComment, setActiveComment] = useState<string | null>(null);
  const [commentValue, setCommentValue] = useState("");
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());
  const parentRef = useRef<HTMLDivElement>(null);

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
    count: runs?.length ?? 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 10,
  });

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

  // ── Progress summary ────────────────────────────────────────────────────────
  const total = runs?.length ?? 0;
  const counts = runs
    ? runs.reduce<Record<string, number>>((acc, run) => {
        const name = run.status.name.toUpperCase();
        acc[name] = (acc[name] ?? 0) + 1;
        return acc;
      }, {})
    : {};
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
        <div>
          <h1 className="text-xl font-semibold">{execution.jira.summary}</h1>
          <p className="mt-0.5 font-mono text-xs text-slate-400">{execution.jira.key}</p>
        </div>
      </div>

      {isLoading && (
        <div className="flex h-48 items-center justify-center">
          <Spinner />
        </div>
      )}

      {isError && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {String(error)}
        </div>
      )}

      {runs && (
        <>
          {/* Progress summary */}
          {total > 0 && (
            <div className="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                <span className="font-medium">{total} test{total !== 1 ? "s" : ""}</span>
                <span className="text-slate-400">
                  {passed} passed · {failed} failed · {blocked} blocked · {executing} executing · {todo} todo
                </span>
              </div>
              {/* Progress bar */}
              <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
                {passed > 0 && (
                  <div
                    className="bg-emerald-500"
                    style={{ width: `${(passed / total) * 100}%` }}
                  />
                )}
                {executing > 0 && (
                  <div
                    className="bg-blue-400"
                    style={{ width: `${(executing / total) * 100}%` }}
                  />
                )}
                {blocked > 0 && (
                  <div
                    className="bg-amber-400"
                    style={{ width: `${(blocked / total) * 100}%` }}
                  />
                )}
                {failed > 0 && (
                  <div
                    className="bg-red-500"
                    style={{ width: `${(failed / total) * 100}%` }}
                  />
                )}
              </div>
            </div>
          )}

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
              style={{ height: Math.min(runs.length * 56, 600) }}
            >
              <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const run = runs[virtualRow.index];
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
                        >
                          {hasSteps && (
                            isExpanded
                              ? <ChevronDown className="h-4 w-4" />
                              : <ChevronRight className="h-4 w-4" />
                          )}
                        </button>

                        {/* Test identity */}
                        <div className="min-w-0">
                          <p className="truncate text-sm text-slate-800">
                            {run.test.jira.summary}
                          </p>
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
                        <Badge variant={statusVariant(run.status.name)}>
                          {run.status.name}
                        </Badge>

                        {/* Status quick-actions (dynamic) */}
                        <div className="flex flex-wrap items-center gap-1">
                          {statuses.map((s) => {
                            const isActive =
                              run.status.name.toUpperCase() === s.name.toUpperCase();
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
                            placeholder="Add a comment…"
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
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setActiveComment(null)}
                          >
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
                          isPending={updateStepStatus.isPending}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
              {runs.length} test{runs.length !== 1 ? "s" : ""}
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
  isPending: boolean;
}

function StepsPanel({ steps, stepStatuses, onStepStatusChange, isPending }: StepsPanelProps) {
  return (
    <div className="border-b border-slate-100 bg-slate-50/60">
      <div className="px-6 py-2">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
          Steps
        </p>
        <div className="space-y-1">
          {steps.map((step, index) => {
            const currentStatus = step.status?.name?.toUpperCase() ?? "";
            return (
              <div
                key={step.id}
                className="rounded-md border border-slate-200 bg-white px-3 py-2"
              >
                <div className="flex items-start gap-3">
                  {/* Step number */}
                  <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-medium text-slate-500">
                    {index + 1}
                  </span>

                  {/* Step content */}
                  <div className="min-w-0 flex-1">
                    {step.action && (
                      <p className="text-sm text-slate-700">{step.action}</p>
                    )}
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
                    {step.actual_result && (
                      <p className="mt-0.5 text-xs text-slate-400">
                        <span className="font-medium text-slate-500">Actual: </span>
                        {step.actual_result}
                      </p>
                    )}
                    {step.comment && (
                      <p className="mt-0.5 text-xs italic text-slate-400">
                        {step.comment}
                      </p>
                    )}
                  </div>

                  {/* Step status + buttons */}
                  <div className="flex flex-shrink-0 items-center gap-1.5">
                    {step.status && (
                      <Badge
                        variant={statusVariant(step.status.name)}
                        className="mr-1 text-[10px]"
                      >
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
