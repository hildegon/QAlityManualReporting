import { useState } from "react";
import {
  useTestExecutions,
  useCreateTestExecution,
  useTestPlans,
  useGetTests,
} from "@/services/queries";
import { useProjectKey } from "@/hooks/useProjectKey";
import { Spinner } from "@/components/ui/spinner";
import { Badge, statusVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ListChecks, Plus, RefreshCw, X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { TestExecutionDetail } from "@/components/test-execution/TestExecutionDetail";
import type { TestExecution } from "@/types";

export function TestExecutionsPage() {
  const projectKey = useProjectKey();
  const {
    data: executions,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useTestExecutions(projectKey);
  const [selected, setSelected] = useState<TestExecution | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  if (!projectKey) {
    return <EmptyState message="Set a Project Key in Settings to view test executions." />;
  }

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (isError) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return (
      <div className="space-y-3">
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          <p className="mb-1 font-medium">Failed to load test executions</p>
          <pre className="whitespace-pre-wrap break-words font-mono text-xs">{errorMessage}</pre>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          <RefreshCw className="mr-1.5 h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  if (selected) {
    return <TestExecutionDetail execution={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          Test Executions
          <span className="ml-2 text-sm font-normal text-slate-500">
            {projectKey} · {executions?.length ?? 0}
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

      {!executions?.length ? (
        <EmptyState message={`No test executions found in ${projectKey}.`} />
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Key</th>
                <th className="px-4 py-3 text-left">Summary</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Assignee</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {executions.map((exec) => (
                <tr
                  key={exec.issue_id}
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() => setSelected(exec)}
                >
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{exec.jira.key}</td>
                  <td className="px-4 py-3 text-slate-800">{exec.jira.summary}</td>
                  <td className="px-4 py-3">
                    {exec.jira.status && (
                      <Badge variant={statusVariant(exec.jira.status.name)}>
                        {exec.jira.status.name}
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {exec.jira.assignee?.display_name ?? "\u2014"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateExecutionDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        projectKey={projectKey}
      />
    </div>
  );
}

interface CreateExecutionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectKey: string | null;
}

function CreateExecutionDialog({
  open,
  onOpenChange,
  projectKey,
}: CreateExecutionDialogProps) {
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [testPlanId, setTestPlanId] = useState<string>("");
  const [selectedTestIds, setSelectedTestIds] = useState<Set<string>>(new Set());
  const [testSearch, setTestSearch] = useState("");

  const createExecution = useCreateTestExecution();
  const { data: testPlans, isLoading: plansLoading } = useTestPlans(projectKey ?? null);
  const { data: tests, isLoading: testsLoading } = useGetTests(projectKey ?? undefined);

  const filteredTests = (tests ?? []).filter((t) => {
    const q = testSearch.toLowerCase();
    return !q || t.jira.key.toLowerCase().includes(q) || t.jira.summary.toLowerCase().includes(q);
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

  const resetForm = () => {
    setSummary("");
    setDescription("");
    setTestPlanId("");
    setSelectedTestIds(new Set());
    setTestSearch("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!summary.trim() || !projectKey) return;
    createExecution.mutate(
      {
        projectKey,
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
        <Dialog.Content className="fixed left-1/2 top-1/2 flex max-h-[90vh] w-full max-w-xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl bg-white shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <Dialog.Title className="text-lg font-semibold">New Test Execution</Dialog.Title>
            <Dialog.Close asChild>
              <button className="rounded p-1 hover:bg-slate-100">
                <X className="h-4 w-4 text-slate-500" />
              </button>
            </Dialog.Close>
          </div>

          {/* Form wraps scrollable body + footer so the submit button is a native form child */}
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            {/* Scrollable body */}
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
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
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

              {/* Tests */}
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
                  <div className="max-h-48 overflow-y-auto rounded-md border border-slate-200">
                    {filteredTests.length === 0 ? (
                      <p className="px-3 py-4 text-center text-sm text-slate-400">
                        {testSearch ? "No tests match your search." : "No tests found."}
                      </p>
                    ) : (
                      <ul className="divide-y divide-slate-100">
                        {filteredTests.map((test) => {
                          const checked = selectedTestIds.has(test.issue_id);
                          return (
                            <li key={test.issue_id}>
                              <label className="flex cursor-pointer items-start gap-3 px-3 py-2 hover:bg-slate-50">
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
            <div className="space-y-3 border-t border-slate-200 px-6 py-4">
              {createExecution.isError && (
                <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
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
                  disabled={createExecution.isPending || !summary.trim() || !projectKey}
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

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-48 flex-col items-center justify-center gap-3 text-slate-400">
      <ListChecks className="h-10 w-10 opacity-40" />
      <p className="text-sm">{message}</p>
    </div>
  );
}
