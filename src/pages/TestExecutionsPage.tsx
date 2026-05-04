import { useState, useMemo, useCallback, useRef, useDeferredValue, useEffect } from "react";
import {
  useTestExecutions,
  useRenameIssue,
  useExecutionSummariesBatch,
  queryKeys,
} from "@/services/queries";
import { useContentProjectKey, useExecutionProjectKey } from "@/hooks/useProjectKey";
import { parseRateLimitError } from "@/stores/uiStore";
import { useVersionsStore } from "@/stores/versionsStore";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHelpButton } from "@/components/common/PageHelpModal";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/components/ui/utils";
import { ListChecks, Plus, RefreshCw } from "lucide-react";
import { TestExecutionDetail } from "@/components/test-execution/TestExecutionDetail";
import type { TestExecution } from "@/types";
import { ExecRow } from "@/components/test-executions/ExecRow";
import { CreateExecutionDialog } from "@/components/test-executions/CreateExecutionDialog";
import { CloneExecutionDialog } from "@/components/test-executions/CloneExecutionDialog";
import { EditExecutionDialog } from "@/components/test-executions/EditExecutionDialog";

/** Status names considered "closed" — hidden by default. */
const DONE_STATUSES = new Set(["done", "won't do", "wont do", "closed", "resolved"]);

/** Max executions shown per page in the regular (non-favourite) list. */
const EXEC_PAGE_SIZE = 10;

function isDoneStatus(name: string) {
  return DONE_STATUSES.has(name.toLowerCase());
}

export function TestExecutionsPage() {
  const executionProjectKey = useExecutionProjectKey();
  const contentProjectKey = useContentProjectKey();
  const { isExecutionFavourite, toggleExecutionFavourite } = useVersionsStore();
  const {
    data: executions,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useTestExecutions(executionProjectKey);
  const renameIssue = useRenameIssue();
  const [selected, setSelected] = useState<TestExecution | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TestExecution | null>(null);
  const [cloneTarget, setCloneTarget] = useState<TestExecution | null>(null);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [showDone, setShowDone] = useState(false);
  const [progressFilter, setProgressFilter] = useState<
    "all" | "fail" | "in_progress" | "pass" | "todo"
  >("all");
  /** The issue key currently being renamed inline, or null when not editing. */
  const [renameKey, setRenameKey] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  /** How many pages of regular (non-favourite) executions are currently shown. */
  const [execPage, setExecPage] = useState(1);

  const q = deferredSearch.trim().toLowerCase();

  // Reset to page 1 whenever the visible set changes so the user isn't stuck
  // on an empty page after toggling a filter or typing in the search box.
  const prevFilterKey = useRef("");
  const filterKey = `${q}|${String(showDone)}|${progressFilter}`;
  if (filterKey !== prevFilterKey.current) {
    prevFilterKey.current = filterKey;
    setExecPage(1);
  }

  const filtered = useMemo(
    () =>
      (executions ?? []).filter((exec) => {
        if (!showDone && exec.jira.status && isDoneStatus(exec.jira.status.name)) return false;
        if (!q) return true;
        return (
          exec.jira.key.toLowerCase().includes(q) || exec.jira.summary.toLowerCase().includes(q)
        );
      }),
    [executions, showDone, q],
  );

  const hiddenDoneCount = useMemo(
    () =>
      (executions ?? []).filter((exec) => exec.jira.status && isDoneStatus(exec.jira.status.name))
        .length,
    [executions],
  );

  const favouriteExecs = useMemo(
    () =>
      executionProjectKey
        ? filtered.filter((e) => isExecutionFavourite(executionProjectKey, e.issue_id))
        : [],
    [executionProjectKey, filtered, isExecutionFavourite],
  );

  const regularExecs = useMemo(
    () =>
      executionProjectKey
        ? filtered.filter((e) => !isExecutionFavourite(executionProjectKey, e.issue_id))
        : filtered,
    [executionProjectKey, filtered, isExecutionFavourite],
  );

  /** Slice of regularExecs currently shown — at most EXEC_PAGE_SIZE × execPage rows. */
  const visibleRegularExecs = regularExecs.slice(0, execPage * EXEC_PAGE_SIZE);
  const hasMoreRegularExecs = visibleRegularExecs.length < regularExecs.length;

  // Collect all visible execution IDs for the batch summary query
  const visibleExecIds = useMemo(
    () => [...favouriteExecs, ...visibleRegularExecs].map((e) => e.issue_id),
    [favouriteExecs, visibleRegularExecs],
  );
  const { data: summariesMap, isLoading: summariesLoading } =
    useExecutionSummariesBatch(visibleExecIds);

  /** Apply the progress filter using batch summaries. Rows without a loaded summary pass through. */
  const progressMatches = useCallback(
    (execId: string): boolean => {
      if (progressFilter === "all") return true;
      const s = summariesMap?.[execId];
      if (!s) return true;
      const counts = s.counts;
      const total = s.total;
      const failCount = (counts["FAIL"] ?? 0) + (counts["FAILED"] ?? 0);
      const passCount = (counts["PASS"] ?? 0) + (counts["PASSED"] ?? 0);
      const todoCount = counts["TODO"] ?? 0;
      switch (progressFilter) {
        case "fail":
          return failCount > 0;
        case "pass":
          return total > 0 && passCount === total;
        case "todo":
          return total > 0 && todoCount === total;
        case "in_progress":
          return total > 0 && failCount === 0 && passCount < total && todoCount < total;
        default:
          return true;
      }
    },
    [progressFilter, summariesMap],
  );

  const displayedFavs = useMemo(
    () => favouriteExecs.filter((e) => progressMatches(e.issue_id)),
    [favouriteExecs, progressMatches],
  );
  const displayedRegulars = useMemo(
    () => visibleRegularExecs.filter((e) => progressMatches(e.issue_id)),
    [visibleRegularExecs, progressMatches],
  );
  const displayedTotal = displayedFavs.length + displayedRegulars.length;

  function handleToggleExecFavourite(e: React.MouseEvent, issueId: string) {
    e.stopPropagation();
    if (!executionProjectKey) return;
    toggleExecutionFavourite(executionProjectKey, issueId);
  }

  const handleSelect = useCallback((exec: TestExecution) => setSelected(exec), []);
  const handleStartRename = useCallback((exec: TestExecution) => {
    setRenameKey(exec.jira.key);
    setRenameDraft(exec.jira.summary);
  }, []);
  const handleCancelRename = useCallback(() => setRenameKey(null), []);
  const handleSaveRename = useCallback(
    (exec: TestExecution, trimmed: string) => {
      if (!executionProjectKey) return;
      renameIssue.mutate(
        {
          issueKey: exec.jira.key,
          summary: trimmed,
          queryKey: queryKeys.testExecutions(executionProjectKey),
        },
        { onSettled: () => setRenameKey(null) },
      );
    },
    [renameIssue, executionProjectKey],
  );
  const handleEdit = useCallback((e: React.MouseEvent, exec: TestExecution) => {
    e.stopPropagation();
    setEditTarget(exec);
  }, []);
  const handleClone = useCallback((e: React.MouseEvent, exec: TestExecution) => {
    e.stopPropagation();
    setCloneTarget(exec);
  }, []);

  useEffect(() => {
    if (selected && executions) {
      const updated = executions.find((e) => e.jira.key === selected.jira.key);
      if (updated && updated !== selected) {
        setSelected(updated);
      }
    }
  }, [executions, selected]);

  if (!executionProjectKey) {
    return (
      <EmptyState
        icon={ListChecks}
        message="Set an Execution Project Key in Settings to view test executions."
      />
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {/* Header skeleton */}
        <div className="mb-4 flex items-center justify-between">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-8 w-20" />
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Spinner size="sm" />
          <span>Loading test executions from Xray…</span>
        </div>
        {/* Row skeletons mimicking key + summary + badge + assignee */}
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-md border border-slate-100 px-3 py-2.5"
          >
            <Skeleton className="h-4 w-20 shrink-0" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-5 rounded-full" />
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
        <div className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
          <p className="font-medium">Rate limited by Xray</p>
          <p className="mt-0.5 text-xs">
            Too many requests. Please wait{seconds > 0 ? ` ~${seconds}s` : ""} and try again.
          </p>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          <p className="mb-1 font-medium">Failed to load test executions</p>
          <pre className="whitespace-pre-wrap break-words font-mono text-xs">{String(error)}</pre>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          <RefreshCw className="mr-1.5 h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  if (selected) {
    return (
      <TestExecutionDetail
        execution={selected}
        onBack={() => setSelected(null)}
        contentProjectKey={contentProjectKey}
      />
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          Test Executions
          <span className="ml-2 text-sm font-normal text-slate-500">
            {executionProjectKey} · {displayedTotal}
            {displayedTotal !== (executions?.length ?? 0) && (
              <span> / {executions?.length ?? 0}</span>
            )}
          </span>
        </h1>
        <div className="flex items-center gap-2">
          <PageHelpButton pageId="executions" />
          <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Reload
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            New execution
          </Button>
        </div>
      </div>

      {/* Progress filter chips */}
      <div className="mb-2 flex items-center gap-2">
        {(["all", "fail", "in_progress", "pass", "todo"] as const).map((f) => {
          const labels: Record<string, string> = {
            all: "All",
            fail: "Has failures",
            in_progress: "In progress",
            pass: "All passing",
            todo: "Not started",
          };
          return (
            <button
              key={f}
              onClick={() => setProgressFilter(f)}
              className={cn(
                "rounded-full border px-3 py-0.5 text-xs font-medium transition-colors",
                progressFilter === f
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-500",
              )}
            >
              {labels[f]}
            </button>
          );
        })}
      </div>

      {/* Filters row */}
      <div className="mb-3 flex items-center gap-3">
        <Input
          className="max-w-xs"
          placeholder="Filter by key or name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          <input
            type="checkbox"
            className="h-4 w-4 accent-blue-600"
            checked={showDone}
            onChange={(e) => setShowDone(e.target.checked)}
          />
          Show done
          {!showDone && hiddenDoneCount > 0 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-700 dark:text-slate-400">
              {hiddenDoneCount} hidden
            </span>
          )}
        </label>
      </div>

      {!filtered.length ? (
        <EmptyState
          icon={ListChecks}
          message={
            q || !showDone
              ? "No executions match the current filters."
              : `No test executions found in ${executionProjectKey}.`
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-700/50 dark:text-slate-400">
              <tr>
                <th className="w-8 px-2 py-3" />
                <th className="px-4 py-3 text-left">Key</th>
                <th className="px-4 py-3 text-left">Summary</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Assignee</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {displayedFavs.length > 0 && (
                <>
                  {displayedFavs.map((exec) => (
                    <ExecRow
                      key={exec.issue_id}
                      exec={exec}
                      isFavourite={true}
                      executionProjectKey={executionProjectKey}
                      renameKey={renameKey}
                      renameDraft={renameDraft}
                      renameIsPending={renameIssue.isPending}
                      summary={summariesMap?.[exec.issue_id]}
                      summaryLoading={summariesLoading}
                      onSelect={handleSelect}
                      onStartRename={handleStartRename}
                      onCancelRename={handleCancelRename}
                      onSaveRename={handleSaveRename}
                      setRenameDraft={setRenameDraft}
                      onToggleFavourite={handleToggleExecFavourite}
                      onEdit={handleEdit}
                      onClone={handleClone}
                    />
                  ))}
                  {displayedRegulars.length > 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="bg-slate-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:bg-slate-700/40 dark:text-slate-400"
                      >
                        All executions
                      </td>
                    </tr>
                  )}
                </>
              )}
              {displayedRegulars.map((exec) => (
                <ExecRow
                  key={exec.issue_id}
                  exec={exec}
                  isFavourite={false}
                  executionProjectKey={executionProjectKey}
                  renameKey={renameKey}
                  renameDraft={renameDraft}
                  renameIsPending={renameIssue.isPending}
                  summary={summariesMap?.[exec.issue_id]}
                  summaryLoading={summariesLoading}
                  onSelect={handleSelect}
                  onStartRename={handleStartRename}
                  onCancelRename={handleCancelRename}
                  onSaveRename={handleSaveRename}
                  setRenameDraft={setRenameDraft}
                  onToggleFavourite={handleToggleExecFavourite}
                  onEdit={handleEdit}
                  onClone={handleClone}
                />
              ))}
            </tbody>
          </table>
          {/* Load more — batched summary is re-fetched with the expanded ID list. */}
          {hasMoreRegularExecs && (
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 dark:border-slate-700">
              <span className="text-xs text-slate-400 dark:text-slate-500">
                Showing {visibleRegularExecs.length} of {regularExecs.length}
              </span>
              <button
                onClick={() => setExecPage((p) => p + 1)}
                className="rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
              >
                Load more ({regularExecs.length - visibleRegularExecs.length} remaining)
              </button>
            </div>
          )}
        </div>
      )}

      <CreateExecutionDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        executionProjectKey={executionProjectKey}
        contentProjectKey={contentProjectKey}
      />

      <EditExecutionDialog
        execution={editTarget}
        executionProjectKey={executionProjectKey}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
      />

      <CloneExecutionDialog
        source={cloneTarget}
        executionProjectKey={executionProjectKey}
        contentProjectKey={contentProjectKey}
        onOpenChange={(open) => {
          if (!open) setCloneTarget(null);
        }}
      />
    </div>
  );
}

export default TestExecutionsPage;
