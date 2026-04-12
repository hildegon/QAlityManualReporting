import { useState, useMemo } from "react";
import { useCreateTestPlan, useProjectComponents, useProjectVersions } from "@/services/queries";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/components/ui/utils";
import { BookOpen, CalendarDays, Search, Tag, X } from "lucide-react";

export interface CreatePlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectKey: string;
}

export function CreatePlanDialog({ open, onOpenChange, projectKey }: CreatePlanDialogProps) {
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [component, setComponent] = useState("");
  const [componentSearch, setComponentSearch] = useState("");
  const [fixVersion, setFixVersion] = useState("");
  const [versionSearch, setVersionSearch] = useState("");

  const createPlan = useCreateTestPlan();

  // Load components and versions only while dialog is open.
  const { data: components, isLoading: componentsLoading } = useProjectComponents(
    open ? projectKey : null,
  );
  const { data: versions, isLoading: versionsLoading } = useProjectVersions(
    open ? projectKey : null,
  );

  const filteredComponents = useMemo(() => {
    const q = componentSearch.trim().toLowerCase();
    return (components ?? []).filter((c) => !q || c.name.toLowerCase().includes(q));
  }, [components, componentSearch]);

  const filteredVersions = useMemo(() => {
    const q = versionSearch.trim().toLowerCase();
    return (versions ?? []).filter((v) => !v.archived && (!q || v.name.toLowerCase().includes(q)));
  }, [versions, versionSearch]);

  const resetForm = () => {
    setSummary("");
    setDescription("");
    setComponent("");
    setComponentSearch("");
    setFixVersion("");
    setVersionSearch("");
    createPlan.reset();
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) resetForm();
    onOpenChange(v);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!summary.trim()) return;
    const vars: Parameters<typeof createPlan.mutate>[0] = { projectKey, summary: summary.trim() };
    if (description.trim()) vars.description = description.trim();
    if (component) vars.component = component;
    if (fixVersion) vars.fixVersion = fixVersion;
    createPlan.mutate(vars, {
      onSuccess: () => {
        handleOpenChange(false);
      },
    });
  };

  const isSubmitting = createPlan.isPending;

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 flex max-h-[90vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl bg-white shadow-xl dark:bg-slate-800">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
            <Dialog.Title className="text-lg font-semibold dark:text-slate-100">
              New Test Plan
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:text-slate-400"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          {/* Scrollable body */}
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 overflow-y-auto">
              <div className="space-y-5 px-6 py-5">
                {/* Project badge */}
                <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                  <BookOpen className="h-4 w-4 text-slate-400" />
                  <span>
                    Creating in project{" "}
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      {projectKey}
                    </span>
                  </span>
                </div>

                {/* Summary */}
                <div className="space-y-1.5">
                  <Label htmlFor="plan-summary">Summary *</Label>
                  <Input
                    id="plan-summary"
                    placeholder="e.g. Regression — Sprint 42"
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    disabled={isSubmitting}
                    autoFocus
                    required
                  />
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <Label htmlFor="plan-desc">
                    Description <span className="font-normal text-slate-400">(optional)</span>
                  </Label>
                  <Input
                    id="plan-desc"
                    placeholder="Scope, goals, or notes for this plan"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>

                {/* Component picker */}
                <div className="space-y-1.5">
                  <Label>
                    Component <span className="font-normal text-slate-400">(optional)</span>
                  </Label>

                  {/* Selected chip */}
                  {component && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-100 py-0.5 pl-2.5 pr-1.5 text-xs font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200">
                      <Tag className="h-3 w-3 text-slate-400" />
                      {component}
                      <button
                        type="button"
                        onClick={() => {
                          setComponent("");
                          setComponentSearch("");
                        }}
                        disabled={isSubmitting}
                        className="ml-0.5 rounded-full text-slate-400 hover:text-slate-600 disabled:opacity-50"
                        aria-label="Clear component"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  )}

                  <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                    <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 dark:border-slate-700">
                      <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <input
                        autoCorrect="off" autoCapitalize="off" spellCheck={false}
                        type="text"
                        placeholder="Filter components…"
                        value={componentSearch}
                        onChange={(e) => setComponentSearch(e.target.value)}
                        disabled={isSubmitting}
                        className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed dark:text-slate-200 dark:placeholder:text-slate-500"
                      />
                      {componentSearch && (
                        <button
                          type="button"
                          onClick={() => setComponentSearch("")}
                          className="text-slate-400 hover:text-slate-600"
                          aria-label="Clear filter"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="max-h-36 overflow-y-auto">
                      {componentsLoading ? (
                        <div className="flex items-center justify-center py-5">
                          <Spinner size="sm" />
                        </div>
                      ) : filteredComponents.length === 0 ? (
                        <p className="py-5 text-center text-xs text-slate-400">
                          {(components ?? []).length === 0
                            ? "No components found in this project."
                            : "No components match your filter."}
                        </p>
                      ) : (
                        filteredComponents.map((c) => (
                          <label
                            key={c.id}
                            className={cn(
                              "flex cursor-pointer items-center gap-3 px-3 py-2 text-sm transition-colors",
                              component === c.name
                                ? "bg-slate-50 dark:bg-slate-700"
                                : "hover:bg-slate-50 dark:hover:bg-slate-700",
                              isSubmitting && "cursor-not-allowed opacity-60",
                            )}
                          >
                            <input
                              autoCorrect="off" autoCapitalize="off" spellCheck={false}
                              type="radio"
                              checked={component === c.name}
                              onChange={() =>
                                setComponent((prev) => (prev === c.name ? "" : c.name))
                              }
                              disabled={isSubmitting}
                              className="h-4 w-4 border-slate-300 accent-slate-800"
                            />
                            <Tag className="h-3 w-3 shrink-0 text-slate-400" />
                            <span className="truncate text-slate-700 dark:text-slate-200">
                              {c.name}
                            </span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* Fix version picker */}
                <div className="space-y-1.5">
                  <Label>
                    Fix Version <span className="font-normal text-slate-400">(optional)</span>
                  </Label>

                  {/* Selected chip */}
                  {fixVersion && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-100 py-0.5 pl-2.5 pr-1.5 text-xs font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200">
                      <CalendarDays className="h-3 w-3 text-slate-400" />
                      {fixVersion}
                      <button
                        type="button"
                        onClick={() => {
                          setFixVersion("");
                          setVersionSearch("");
                        }}
                        disabled={isSubmitting}
                        className="ml-0.5 rounded-full text-slate-400 hover:text-slate-600 disabled:opacity-50"
                        aria-label="Clear version"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  )}

                  <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                    <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 dark:border-slate-700">
                      <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <input
                        autoCorrect="off" autoCapitalize="off" spellCheck={false}
                        type="text"
                        placeholder="Filter versions…"
                        value={versionSearch}
                        onChange={(e) => setVersionSearch(e.target.value)}
                        disabled={isSubmitting}
                        className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed dark:text-slate-200 dark:placeholder:text-slate-500"
                      />
                      {versionSearch && (
                        <button
                          type="button"
                          onClick={() => setVersionSearch("")}
                          className="text-slate-400 hover:text-slate-600"
                          aria-label="Clear filter"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="max-h-36 overflow-y-auto">
                      {versionsLoading ? (
                        <div className="flex items-center justify-center py-5">
                          <Spinner size="sm" />
                        </div>
                      ) : filteredVersions.length === 0 ? (
                        <p className="py-5 text-center text-xs text-slate-400">
                          {(versions ?? []).filter((v) => !v.archived).length === 0
                            ? "No active versions found in this project."
                            : "No versions match your filter."}
                        </p>
                      ) : (
                        filteredVersions.map((v) => (
                          <label
                            key={v.id}
                            className={cn(
                              "flex cursor-pointer items-center gap-3 px-3 py-2 text-sm transition-colors",
                              fixVersion === v.name
                                ? "bg-slate-50 dark:bg-slate-700"
                                : "hover:bg-slate-50 dark:hover:bg-slate-700",
                              isSubmitting && "cursor-not-allowed opacity-60",
                            )}
                          >
                            <input
                              autoCorrect="off" autoCapitalize="off" spellCheck={false}
                              type="radio"
                              checked={fixVersion === v.name}
                              onChange={() =>
                                setFixVersion((prev) => (prev === v.name ? "" : v.name))
                              }
                              disabled={isSubmitting}
                              className="h-4 w-4 border-slate-300 accent-slate-800"
                            />
                            <CalendarDays className="h-3 w-3 shrink-0 text-slate-400" />
                            <div className="min-w-0">
                              <span className="truncate text-slate-700 dark:text-slate-200">
                                {v.name}
                              </span>
                              {v.released && (
                                <span className="ml-1.5 text-[10px] text-emerald-600">
                                  released
                                </span>
                              )}
                            </div>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* Error */}
                {createPlan.isError && (
                  <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
                    {String(createPlan.error)}
                  </p>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-6 py-4 dark:border-slate-700">
              <Dialog.Close asChild>
                <Button type="button" variant="outline" disabled={isSubmitting}>
                  Cancel
                </Button>
              </Dialog.Close>
              <Button type="submit" disabled={!summary.trim() || isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Spinner className="h-4 w-4" />
                    Creating…
                  </>
                ) : (
                  "Create Test Plan"
                )}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
