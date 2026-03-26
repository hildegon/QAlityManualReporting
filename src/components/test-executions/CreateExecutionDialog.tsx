import { useState, useMemo, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useTestPlans,
  useGetTests,
  useGetTestSets,
  useCreateTestExecution,
  queryKeys,
} from "@/services/queries";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { X } from "lucide-react";
import type { XrayTest } from "@/types";
import * as api from "@/services/tauri";

export interface CreateExecutionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Project key under which the new execution will be created */
  executionProjectKey: string | null;
  /** Project key used to load Test Plans, Test Sets, and Tests */
  contentProjectKey: string | null;
}

export function CreateExecutionDialog({
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
  // Always pass projectKey (not undefined-when-closed) so the result lands in the shared
  // ["xray","test-sets",<key>] cache slot that every other page reads from.
  // The enabled: !!projectKey guard inside the hook prevents any actual network call
  // when contentProjectKey is absent.
  const { data: testSets, isLoading: testSetsLoading } = useGetTestSets(
    contentProjectKey ?? undefined,
  );

  const filteredTests = useMemo(() => {
    const q = testSearch.toLowerCase();
    return (tests ?? []).filter(
      (t) => !q || t.jira.key.toLowerCase().includes(q) || t.jira.summary.toLowerCase().includes(q),
    );
  }, [tests, testSearch]);

  const filteredTestSets = useMemo(() => {
    const q = testSetSearch.toLowerCase();
    return (testSets ?? []).filter(
      (ts) =>
        !q || ts.jira.key.toLowerCase().includes(q) || ts.jira.summary.toLowerCase().includes(q),
    );
  }, [testSets, testSetSearch]);

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
            <Dialog.Title className="text-lg font-semibold dark:text-slate-100">
              New Test Execution
            </Dialog.Title>
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
