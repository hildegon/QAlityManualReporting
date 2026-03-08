import { useState, useCallback, useRef } from "react";
import {
  useTestExecutions,
  useCreateTestExecution,
  useTestPlans,
  useGetTests,
  useGetTestSets,
  useIssueTransitions,
  useSearchUsers,
  useTransitionIssue,
  useUpdateAssignee,
  useRenameIssue,
  queryKeys,
} from "@/services/queries";
import { useContentProjectKey, useExecutionProjectKey } from "@/hooks/useProjectKey";
import { useQueryClient } from "@tanstack/react-query";
import { parseRateLimitError } from "@/stores/uiStore";
import { useVersionsStore } from "@/stores/versionsStore";
import { cn } from "@/components/ui/utils";
import { EmptyState } from "@/components/common/EmptyState";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge, statusVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, ListChecks, Pencil, Plus, RefreshCw, Star, X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { TestExecutionDetail } from "@/components/test-execution/TestExecutionDetail";
import type { JiraUser, TestExecution, TestRunsPage, XrayTest } from "@/types";
import * as api from "@/services/tauri";

/** Status names considered "closed" — hidden by default. */
const DONE_STATUSES = new Set(["done", "won't do", "wont do", "closed", "resolved"]);

function isDoneStatus(name: string) {
  return DONE_STATUSES.has(name.toLowerCase());
}

// ── ExecRow ───────────────────────────────────────────────────────────────────

interface ExecRowProps {
  exec: TestExecution;
  isFavourite: boolean;
  executionProjectKey: string;
  renameKey: string | null;
  renameDraft: string;
  renameIsPending: boolean;
  onSelect: () => void;
  onStartRename: () => void;
  onCancelRename: () => void;
  onSaveRename: (trimmed: string) => void;
  setRenameDraft: (v: string) => void;
  onToggleFavourite: (e: React.MouseEvent) => void;
  onEdit: (e: React.MouseEvent) => void;
  onClone: (e: React.MouseEvent) => void;
}

function ExecRow({
  exec,
  isFavourite,
  renameKey,
  renameDraft,
  renameIsPending,
  onSelect,
  onStartRename,
  onCancelRename,
  onSaveRename,
  setRenameDraft,
  onToggleFavourite,
  onEdit,
  onClone,
}: ExecRowProps) {
  return (
    <tr
      className={cn(
        "group cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50",
        isFavourite && "bg-amber-50/40 dark:bg-amber-900/20",
      )}
      onClick={onSelect}
    >
      {/* Favourite star */}
      <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
        <button
          aria-label={isFavourite ? "Remove from favourites" : "Add to favourites"}
          onClick={onToggleFavourite}
          className={cn(
            "rounded p-0.5 transition-colors",
            isFavourite
              ? "text-amber-400 hover:text-amber-500"
              : "text-slate-300 hover:text-amber-400",
          )}
        >
          <Star
            className="h-3.5 w-3.5"
            fill={isFavourite ? "currentColor" : "none"}
            strokeWidth={isFavourite ? 0 : 1.5}
          />
        </button>
      </td>

      <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">
        {exec.jira.key}
      </td>

      <td
        className="px-4 py-3 text-slate-800 dark:text-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {renameKey === exec.jira.key ? (
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              const trimmed = renameDraft.trim();
              if (!trimmed || trimmed === exec.jira.summary) {
                onCancelRename();
                return;
              }
              onSaveRename(trimmed);
            }}
          >
            <input
              autoFocus
              className="flex-1 rounded border border-slate-300 px-2 py-0.5 text-sm focus:border-slate-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") onCancelRename();
              }}
              disabled={renameIsPending}
            />
            <button
              type="submit"
              className="rounded px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-600"
              disabled={renameIsPending}
            >
              {renameIsPending ? "…" : "Save"}
            </button>
            <button
              type="button"
              className="rounded px-2 py-0.5 text-xs text-slate-400 hover:bg-slate-100 dark:text-slate-500 dark:hover:bg-slate-600"
              onClick={onCancelRename}
            >
              Cancel
            </button>
          </form>
        ) : (
          <span
            className="group/rename flex cursor-pointer items-center gap-1.5"
            onClick={onStartRename}
          >
            {exec.jira.summary}
            <Pencil className="h-3.5 w-3.5 shrink-0 text-slate-300 opacity-0 group-hover/rename:opacity-100" />
          </span>
        )}
      </td>

      <td className="px-4 py-3">
        {exec.jira.status && (
          <Badge variant={statusVariant(exec.jira.status.name)}>{exec.jira.status.name}</Badge>
        )}
      </td>

      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
        {exec.jira.assignee?.display_name ?? "\u2014"}
      </td>

      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <button
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:text-slate-400"
            title="Edit status / assignee"
            onClick={onEdit}
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:text-slate-400"
            title="Clone execution"
            onClick={onClone}
          >
            <Copy className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
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
  const [showDone, setShowDone] = useState(false);
  /** The issue key currently being renamed inline, or null when not editing. */
  const [renameKey, setRenameKey] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

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

  const q = search.trim().toLowerCase();
  const filtered = (executions ?? []).filter((exec) => {
    if (!showDone && exec.jira.status && isDoneStatus(exec.jira.status.name)) return false;
    if (!q) return true;
    return exec.jira.key.toLowerCase().includes(q) || exec.jira.summary.toLowerCase().includes(q);
  });

  const hiddenDoneCount = (executions ?? []).filter(
    (exec) => exec.jira.status && isDoneStatus(exec.jira.status.name),
  ).length;

  const favouriteExecs = executionProjectKey
    ? filtered.filter((e) => isExecutionFavourite(executionProjectKey, e.issue_id))
    : [];
  const regularExecs = executionProjectKey
    ? filtered.filter((e) => !isExecutionFavourite(executionProjectKey, e.issue_id))
    : filtered;

  function handleToggleExecFavourite(e: React.MouseEvent, issueId: string) {
    e.stopPropagation();
    if (!executionProjectKey) return;
    toggleExecutionFavourite(executionProjectKey, issueId);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          Test Executions
          <span className="ml-2 text-sm font-normal text-slate-500">
            {executionProjectKey} · {filtered.length}
            {filtered.length !== (executions?.length ?? 0) && (
              <span> / {executions?.length ?? 0}</span>
            )}
          </span>
        </h1>
        <div className="flex items-center gap-2">
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
              {favouriteExecs.length > 0 && (
                <>
                  {favouriteExecs.map((exec) => (
                    <ExecRow
                      key={exec.issue_id}
                      exec={exec}
                      isFavourite={true}
                      executionProjectKey={executionProjectKey}
                      renameKey={renameKey}
                      renameDraft={renameDraft}
                      renameIsPending={renameIssue.isPending}
                      onSelect={() => setSelected(exec)}
                      onStartRename={() => {
                        setRenameKey(exec.jira.key);
                        setRenameDraft(exec.jira.summary);
                      }}
                      onCancelRename={() => setRenameKey(null)}
                      onSaveRename={(trimmed) => {
                        renameIssue.mutate(
                          {
                            issueKey: exec.jira.key,
                            summary: trimmed,
                            queryKey: queryKeys.testExecutions(executionProjectKey),
                          },
                          { onSettled: () => setRenameKey(null) },
                        );
                      }}
                      setRenameDraft={setRenameDraft}
                      onToggleFavourite={(e) => handleToggleExecFavourite(e, exec.issue_id)}
                      onEdit={(e) => {
                        e.stopPropagation();
                        setEditTarget(exec);
                      }}
                      onClone={(e) => {
                        e.stopPropagation();
                        setCloneTarget(exec);
                      }}
                    />
                  ))}
                  {regularExecs.length > 0 && (
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
              {regularExecs.map((exec) => (
                <ExecRow
                  key={exec.issue_id}
                  exec={exec}
                  isFavourite={false}
                  executionProjectKey={executionProjectKey}
                  renameKey={renameKey}
                  renameDraft={renameDraft}
                  renameIsPending={renameIssue.isPending}
                  onSelect={() => setSelected(exec)}
                  onStartRename={() => {
                    setRenameKey(exec.jira.key);
                    setRenameDraft(exec.jira.summary);
                  }}
                  onCancelRename={() => setRenameKey(null)}
                  onSaveRename={(trimmed) => {
                    renameIssue.mutate(
                      {
                        issueKey: exec.jira.key,
                        summary: trimmed,
                        queryKey: queryKeys.testExecutions(executionProjectKey),
                      },
                      { onSettled: () => setRenameKey(null) },
                    );
                  }}
                  setRenameDraft={setRenameDraft}
                  onToggleFavourite={(e) => handleToggleExecFavourite(e, exec.issue_id)}
                  onEdit={(e) => {
                    e.stopPropagation();
                    setEditTarget(exec);
                  }}
                  onClone={(e) => {
                    e.stopPropagation();
                    setCloneTarget(exec);
                  }}
                />
              ))}
            </tbody>
          </table>
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

interface CreateExecutionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Project key under which the new execution will be created */
  executionProjectKey: string | null;
  /** Project key used to load Test Plans, Test Sets, and Tests */
  contentProjectKey: string | null;
}

function CreateExecutionDialog({
  open,
  onOpenChange,
  executionProjectKey,
  contentProjectKey,
}: CreateExecutionDialogProps) {
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [testPlanId, setTestPlanId] = useState<string>("");
  const [selectedTestIds, setSelectedTestIds] = useState<Set<string>>(new Set());
  const [testSearch, setTestSearch] = useState("");
  const [testSetSearch, setTestSetSearch] = useState("");
  // issueId → loading state for per-row "Add" buttons
  const [addingSetId, setAddingSetId] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const createExecution = useCreateTestExecution();
  // Only fetch these when the dialog is actually open — avoids unnecessary API
  // calls on every page load.
  const { data: testPlans, isLoading: plansLoading } = useTestPlans(
    open ? (contentProjectKey ?? null) : null,
  );
  const { data: tests, isLoading: testsLoading } = useGetTests(
    open ? (contentProjectKey ?? undefined) : undefined,
  );
  const { data: testSets, isLoading: testSetsLoading } = useGetTestSets(
    open ? (contentProjectKey ?? undefined) : undefined,
  );

  const filteredTests = (tests ?? []).filter((t) => {
    const q = testSearch.toLowerCase();
    return !q || t.jira.key.toLowerCase().includes(q) || t.jira.summary.toLowerCase().includes(q);
  });

  const filteredTestSets = (testSets ?? []).filter((ts) => {
    const q = testSetSearch.toLowerCase();
    return !q || ts.jira.key.toLowerCase().includes(q) || ts.jira.summary.toLowerCase().includes(q);
  });

  const toggleTest = (issueId: string) => {
    setSelectedTestIds((prev) => {
      const next = new Set(prev);
      if (next.has(issueId)) {
        next.delete(issueId);
      } else {
        next.add(issueId);
      }
      return next;
    });
  };

  const handleAddFromSet = useCallback(
    async (issueId: string) => {
      setAddingSetId(issueId);
      try {
        const setTests = await queryClient.fetchQuery<XrayTest[]>({
          queryKey: queryKeys.testSetTests(issueId),
          queryFn: () => api.getTestSetTests(issueId),
          staleTime: 5 * 60 * 1_000,
        });
        setSelectedTestIds((prev) => {
          const next = new Set(prev);
          for (const t of setTests) {
            next.add(t.issue_id);
          }
          return next;
        });
      } catch {
        // silently ignore — the button will just re-enable
      } finally {
        setAddingSetId(null);
      }
    },
    [queryClient],
  );

  const resetForm = () => {
    setSummary("");
    setDescription("");
    setTestPlanId("");
    setSelectedTestIds(new Set());
    setTestSearch("");
    setTestSetSearch("");
    setAddingSetId(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!summary.trim() || !executionProjectKey) return;
    createExecution.mutate(
      {
        projectKey: executionProjectKey,
        summary,
        description: description || undefined,
        ...(testPlanId ? { testPlanId } : {}),
        ...(selectedTestIds.size > 0 ? { testIssueIds: [...selectedTestIds] } : {}),
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          resetForm();
        },
      },
    );
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        if (!v) resetForm();
        onOpenChange(v);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 flex max-h-[90vh] w-full max-w-xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl bg-white shadow-xl dark:bg-slate-800">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
            <Dialog.Title className="text-lg font-semibold">New Test Execution</Dialog.Title>
            <Dialog.Close asChild>
              <button className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700">
                <X className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              </button>
            </Dialog.Close>
          </div>

          {/* Form wraps scrollable body + footer */}
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="space-y-5">
                {/* Summary */}
                <div className="space-y-1.5">
                  <Label htmlFor="exec-summary">Summary *</Label>
                  <Input
                    id="exec-summary"
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    placeholder="Regression suite — Sprint 42"
                    required
                  />
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <Label htmlFor="exec-desc">Description</Label>
                  <Input
                    id="exec-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional description"
                  />
                </div>

                {/* Test Plan */}
                <div className="space-y-1.5">
                  <Label htmlFor="exec-plan">Test Plan</Label>
                  {plansLoading ? (
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                      <Spinner size="sm" /> Loading test plans…
                    </div>
                  ) : (
                    <select
                      id="exec-plan"
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
                      value={testPlanId}
                      onChange={(e) => setTestPlanId(e.target.value)}
                    >
                      <option value="">— None —</option>
                      {(testPlans ?? []).map((plan) => (
                        <option key={plan.issue_id} value={plan.issue_id}>
                          {plan.jira.key} — {plan.jira.summary}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Test Sets — filterable list, add per row */}
                <div className="space-y-1.5">
                  <Label>Test Sets</Label>
                  {testSetsLoading ? (
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                      <Spinner size="sm" /> Loading test sets…
                    </div>
                  ) : (
                    <>
                      <Input
                        placeholder="Filter by key or name…"
                        value={testSetSearch}
                        onChange={(e) => setTestSetSearch(e.target.value)}
                      />
                      <div className="max-h-40 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-700">
                        {filteredTestSets.length === 0 ? (
                          <p className="px-3 py-4 text-center text-sm text-slate-400">
                            {testSetSearch
                              ? "No test sets match your filter."
                              : "No test sets found."}
                          </p>
                        ) : (
                          <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                            {filteredTestSets.map((ts) => {
                              const isAdding = addingSetId === ts.issue_id;
                              return (
                                <li
                                  key={ts.issue_id}
                                  className="flex items-center justify-between gap-3 px-3 py-2"
                                >
                                  <div className="min-w-0">
                                    <span className="mr-1.5 font-mono text-xs text-slate-500">
                                      {ts.jira.key}
                                    </span>
                                    <span className="text-sm text-slate-800">
                                      {ts.jira.summary}
                                    </span>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="shrink-0"
                                    disabled={isAdding || addingSetId !== null}
                                    onClick={() => void handleAddFromSet(ts.issue_id)}
                                  >
                                    {isAdding ? <Spinner size="sm" /> : "Add"}
                                  </Button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Individual tests */}
                <div className="space-y-1.5">
                  <Label>
                    Tests
                    {selectedTestIds.size > 0 && (
                      <span className="ml-1.5 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-normal text-blue-700">
                        {selectedTestIds.size} selected
                      </span>
                    )}
                  </Label>
                  <Input
                    placeholder="Search by key or summary…"
                    value={testSearch}
                    onChange={(e) => setTestSearch(e.target.value)}
                  />
                  {testsLoading ? (
                    <div className="flex items-center gap-2 py-2 text-sm text-slate-400">
                      <Spinner size="sm" /> Loading tests…
                    </div>
                  ) : (
                    <div className="max-h-48 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-700">
                      {filteredTests.length === 0 ? (
                        <p className="px-3 py-4 text-center text-sm text-slate-400">
                          {testSearch ? "No tests match your search." : "No tests found."}
                        </p>
                      ) : (
                        <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                          {filteredTests.map((test) => {
                            const checked = selectedTestIds.has(test.issue_id);
                            return (
                              <li key={test.issue_id}>
                                <label className="flex cursor-pointer items-start gap-3 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700">
                                  <input
                                    type="checkbox"
                                    className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600"
                                    checked={checked}
                                    onChange={() => toggleTest(test.issue_id)}
                                  />
                                  <div className="min-w-0">
                                    <span className="mr-1.5 font-mono text-xs text-slate-500">
                                      {test.jira.key}
                                    </span>
                                    <span className="text-sm text-slate-800">
                                      {test.jira.summary}
                                    </span>
                                  </div>
                                </label>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="space-y-3 border-t border-slate-200 px-6 py-4 dark:border-slate-700">
              {createExecution.isError && (
                <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                  <p className="font-medium">Failed to create test execution</p>
                  <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-xs">
                    {String(createExecution.error)}
                  </pre>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Dialog.Close asChild>
                  <Button type="button" variant="outline" onClick={resetForm}>
                    Cancel
                  </Button>
                </Dialog.Close>
                <Button
                  type="submit"
                  disabled={createExecution.isPending || !summary.trim() || !executionProjectKey}
                >
                  {createExecution.isPending ? <Spinner size="sm" /> : "Create"}
                </Button>
              </div>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ── CloneExecutionDialog ──────────────────────────────────────────────────────

interface CloneExecutionDialogProps {
  /** The execution to clone, or null when the dialog is closed. */
  source: TestExecution | null;
  executionProjectKey: string | null;
  contentProjectKey: string | null;
  onOpenChange: (open: boolean) => void;
}

function CloneExecutionDialog({
  source,
  executionProjectKey,
  contentProjectKey: _contentProjectKey,
  onOpenChange,
}: CloneExecutionDialogProps) {
  const open = !!source;

  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  // Ids of tests copied from the source execution
  const [testIssueIds, setTestIssueIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const createExecution = useCreateTestExecution();

  // When the source changes (dialog opens), pre-fill summary and fetch test IDs.
  const prevSourceRef = useRef<string | null>(null);
  if (source && source.issue_id !== prevSourceRef.current) {
    prevSourceRef.current = source.issue_id;
    setSummary(`Copy of ${source.jira.summary}`);
    setDescription("");
    setTestIssueIds([]);
    setLoadError(null);
    setLoading(true);

    // Fetch all runs for this execution to extract test IDs.
    // We load up to 500 in a single request — enough for any real execution.
    queryClient
      .fetchQuery<TestRunsPage>({
        queryKey: [...queryKeys.testRuns(source.issue_id), "clone-prefetch"],
        queryFn: () => api.getTestRuns(source.issue_id, 500, 0),
        staleTime: 5 * 60 * 1_000,
      })
      .then((page) => {
        setTestIssueIds(page.results.map((r: TestRunsPage["results"][number]) => r.test.issue_id));
      })
      .catch((err: unknown) => {
        setLoadError(String(err));
      })
      .finally(() => {
        setLoading(false);
      });
  }

  const resetForm = () => {
    prevSourceRef.current = null;
    setSummary("");
    setDescription("");
    setTestIssueIds([]);
    setLoading(false);
    setLoadError(null);
    createExecution.reset();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!summary.trim() || !executionProjectKey) return;
    createExecution.mutate(
      {
        projectKey: executionProjectKey,
        summary,
        description: description || undefined,
        testIssueIds: testIssueIds.length > 0 ? testIssueIds : undefined,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          resetForm();
        },
      },
    );
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        if (!v) resetForm();
        onOpenChange(v);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 flex max-h-[85vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl bg-white shadow-xl dark:bg-slate-800">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
            <div>
              <Dialog.Title className="text-lg font-semibold">Clone Execution</Dialog.Title>
              {source && (
                <p className="mt-0.5 font-mono text-xs text-slate-500 dark:text-slate-400">
                  {source.jira.key}
                </p>
              )}
            </div>
            <Dialog.Close asChild>
              <button className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700">
                <X className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              </button>
            </Dialog.Close>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="space-y-5">
                {/* Summary */}
                <div className="space-y-1.5">
                  <Label htmlFor="clone-summary">Summary *</Label>
                  <Input
                    id="clone-summary"
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    required
                  />
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <Label htmlFor="clone-desc">Description</Label>
                  <Input
                    id="clone-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional description"
                  />
                </div>

                {/* Tests preview */}
                <div className="space-y-1.5">
                  <Label>Tests from source</Label>
                  {loading ? (
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                      <Spinner size="sm" /> Loading tests from source execution…
                    </div>
                  ) : loadError ? (
                    <p className="text-sm text-red-600">
                      Could not load tests: {loadError}. The clone will be created without tests.
                    </p>
                  ) : (
                    <p className="text-sm text-slate-500">
                      {testIssueIds.length > 0
                        ? `${testIssueIds.length} test${testIssueIds.length !== 1 ? "s" : ""} will be included.`
                        : "No tests found in the source execution."}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="space-y-3 border-t border-slate-200 px-6 py-4 dark:border-slate-700">
              {createExecution.isError && (
                <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                  <p className="font-medium">Failed to clone execution</p>
                  <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-xs">
                    {String(createExecution.error)}
                  </pre>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Dialog.Close asChild>
                  <Button type="button" variant="outline" onClick={resetForm}>
                    Cancel
                  </Button>
                </Dialog.Close>
                <Button
                  type="submit"
                  disabled={
                    createExecution.isPending || loading || !summary.trim() || !executionProjectKey
                  }
                >
                  {createExecution.isPending ? <Spinner size="sm" /> : "Clone"}
                </Button>
              </div>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ── EditExecutionDialog ───────────────────────────────────────────────────────

interface EditExecutionDialogProps {
  /** The execution to edit, or null when the dialog is closed. */
  execution: TestExecution | null;
  /** Execution project key — used to invalidate caches on success. */
  executionProjectKey: string | null;
  onOpenChange: (open: boolean) => void;
}

function EditExecutionDialog({
  execution,
  executionProjectKey,
  onOpenChange,
}: EditExecutionDialogProps) {
  const open = !!execution;
  const issueKey = execution?.jira.key ?? null;

  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: transitions, isLoading: transitionsLoading } = useIssueTransitions(
    open ? issueKey : null,
  );
  const { data: userResults, isFetching: usersLoading } = useSearchUsers(debouncedQuery);

  const transitionIssue = useTransitionIssue();
  const updateAssignee = useUpdateAssignee();

  const handleAssigneeInput = (value: string) => {
    setAssigneeSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(value), 350);
  };

  const handleTransition = (transitionId: string) => {
    if (!issueKey || !executionProjectKey) return;
    transitionIssue.mutate(
      { issueKey, transitionId, executionProjectKey },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  const handleAssign = (user: JiraUser) => {
    if (!issueKey || !executionProjectKey) return;
    updateAssignee.mutate(
      { issueKey, accountId: user.account_id, executionProjectKey },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  const handleUnassign = () => {
    if (!issueKey || !executionProjectKey) return;
    updateAssignee.mutate(
      { issueKey, executionProjectKey },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  const isMutating = transitionIssue.isPending || updateAssignee.isPending;
  const mutationError = transitionIssue.error ?? updateAssignee.error;

  const resetLocal = () => {
    setAssigneeSearch("");
    setDebouncedQuery("");
    transitionIssue.reset();
    updateAssignee.reset();
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        if (!v) resetLocal();
        onOpenChange(v);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 flex max-h-[85vh] w-full max-w-md -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl bg-white shadow-xl dark:bg-slate-800">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
            <div>
              <Dialog.Title className="text-lg font-semibold">Edit Execution</Dialog.Title>
              {issueKey && (
                <p className="mt-0.5 font-mono text-xs text-slate-500 dark:text-slate-400">
                  {issueKey}
                </p>
              )}
            </div>
            <Dialog.Close asChild>
              <button className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700">
                <X className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              </button>
            </Dialog.Close>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
            {/* ── Status transitions ── */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Transition Status
              </h3>
              {transitionsLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Spinner size="sm" /> Loading transitions…
                </div>
              ) : !transitions?.length ? (
                <p className="text-sm text-slate-400">No transitions available.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {transitions.map((t) => (
                    <button
                      key={t.id}
                      disabled={isMutating}
                      onClick={() => handleTransition(t.id)}
                      className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-slate-700 transition-colors hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:border-blue-500 dark:hover:bg-blue-900/30 dark:hover:text-blue-300"
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ── Assignee ── */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">Assignee</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Current:{" "}
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {execution?.jira.assignee?.display_name ?? "Unassigned"}
                </span>
              </p>

              <Input
                placeholder="Search by name or email…"
                value={assigneeSearch}
                onChange={(e) => handleAssigneeInput(e.target.value)}
                disabled={isMutating}
              />

              {debouncedQuery.length >= 2 && (
                <div className="rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                  {usersLoading ? (
                    <div className="flex items-center gap-2 px-3 py-3 text-sm text-slate-400">
                      <Spinner size="sm" /> Searching…
                    </div>
                  ) : !userResults?.length ? (
                    <p className="px-3 py-3 text-sm text-slate-400">No users found.</p>
                  ) : (
                    <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                      {userResults.map((user) => (
                        <li key={user.account_id}>
                          <button
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50 dark:hover:bg-slate-700"
                            disabled={isMutating}
                            onClick={() => handleAssign(user)}
                          >
                            {user.avatar_urls?.["16x16"] && (
                              <img
                                src={user.avatar_urls["16x16"]}
                                alt=""
                                className="h-5 w-5 rounded-full"
                              />
                            )}
                            <span className="text-slate-800 dark:text-slate-300">
                              {user.display_name}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {execution?.jira.assignee && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isMutating}
                  onClick={handleUnassign}
                >
                  Unassign
                </Button>
              )}
            </div>

            {/* Error display */}
            {mutationError && (
              <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                <p className="font-medium">Operation failed</p>
                <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-xs">
                  {String(mutationError)}
                </pre>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-slate-200 px-6 py-3 flex justify-end dark:border-slate-700">
            <Dialog.Close asChild>
              <Button type="button" variant="outline" onClick={resetLocal} disabled={isMutating}>
                {isMutating ? <Spinner size="sm" /> : "Close"}
              </Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
