import { useState, useRef } from "react";
import {
  useIssueTransitions,
  useSearchUsers,
  useTransitionIssue,
  useUpdateAssignee,
} from "@/services/queries";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { X } from "lucide-react";
import type { JiraUser, TestExecution } from "@/types";

export interface EditExecutionDialogProps {
  /** The execution to edit, or null when the dialog is closed. */
  execution: TestExecution | null;
  /** Execution project key — used to invalidate caches on success. */
  executionProjectKey: string | null;
  onOpenChange: (open: boolean) => void;
}

export function EditExecutionDialog({
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
              <Dialog.Title className="text-lg font-semibold dark:text-slate-100">
                Edit Execution
              </Dialog.Title>
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
