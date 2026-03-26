import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateTestExecution, queryKeys } from "@/services/queries";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { X } from "lucide-react";
import type { TestExecution, TestRunsPage } from "@/types";
import * as api from "@/services/tauri";

export interface CloneExecutionDialogProps {
  /** The execution to clone, or null when the dialog is closed. */
  source: TestExecution | null;
  executionProjectKey: string | null;
  contentProjectKey: string | null;
  onOpenChange: (open: boolean) => void;
}

export function CloneExecutionDialog({
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
              <Dialog.Title className="text-lg font-semibold dark:text-slate-100">
                Clone Execution
              </Dialog.Title>
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
