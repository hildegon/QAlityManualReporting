import { useState } from "react";
import { useTestExecutions, useCreateTestExecution } from "@/services/queries";
import { useProjectKey } from "@/hooks/useProjectKey";
import { useProjectStore } from "@/stores/projectStore";
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
  const { activeProject } = useProjectStore();
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
        projectId={activeProject?.id ?? null}
        projectKey={projectKey}
      />
    </div>
  );
}

interface CreateExecutionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null;
  projectKey: string | null;
}

function CreateExecutionDialog({
  open,
  onOpenChange,
  projectId,
  projectKey,
}: CreateExecutionDialogProps) {
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const createExecution = useCreateTestExecution();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!summary.trim() || !projectId || !projectKey) return;
    createExecution.mutate(
      { projectId, projectKey, summary, description: description || undefined },
      {
        onSuccess: () => {
          onOpenChange(false);
          setSummary("");
          setDescription("");
        },
      },
    );
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-xl">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold">New Test Execution</Dialog.Title>
            <Dialog.Close asChild>
              <button className="rounded p-1 hover:bg-slate-100">
                <X className="h-4 w-4 text-slate-500" />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
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
            <div className="space-y-1.5">
              <Label htmlFor="exec-desc">Description</Label>
              <Input
                id="exec-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Dialog.Close asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button
                type="submit"
                disabled={createExecution.isPending || !summary.trim() || !projectId}
              >
                {createExecution.isPending ? <Spinner size="sm" /> : "Create"}
              </Button>
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
