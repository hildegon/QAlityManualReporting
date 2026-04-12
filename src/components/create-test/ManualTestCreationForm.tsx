import { useState, useRef, useEffect } from "react";
import {
  Plus,
  CheckCircle2,
  AlertCircle,
  Search,
  X,
  Layers,
  Tag,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useCreateTest } from "@/services/queries";
import * as api from "@/services/tauri";
import { cn } from "@/components/ui/utils";
import type { CreateTestStepInput, XrayTestSet } from "@/types";
import { type DraftStep, nextId, newDraftStep } from "./types";
import { StepRow } from "./StepRow";
import { TestSetRow } from "./TestSetRow";
import { ComponentRow } from "./ComponentRow";

interface JiraComponent {
  id: string;
  name: string;
}

interface ManualTestCreationFormProps {
  projectKey: string;
  testSets: XrayTestSet[] | undefined;
  testSetsLoading: boolean;
  components: JiraComponent[] | undefined;
  componentsLoading: boolean;
  jiraConfigured: boolean;
}

export function ManualTestCreationForm({
  projectKey,
  testSets,
  testSetsLoading,
  components,
  componentsLoading,
  jiraConfigured,
}: ManualTestCreationFormProps) {
  const createTest = useCreateTest();

  const [summary, setSummary] = useState("");
  const [steps, setSteps] = useState<DraftStep[]>([newDraftStep()]);
  const [selectedSetIds, setSelectedSetIds] = useState<Set<string>>(new Set());
  const [setSearch, setSetSearch] = useState("");
  const [componentName, setComponentName] = useState("");
  const [componentSearch, setComponentSearch] = useState("");
  const [keepContext, setKeepContext] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [linkErrors, setLinkErrors] = useState<string[]>([]);
  const [showComponentPicker, setShowComponentPicker] = useState(false);
  const [showSetPicker, setShowSetPicker] = useState(false);
  const pendingFocusIdRef = useRef<string | null>(null);

  const isSubmitting = createTest.isPending;
  const canSubmit = summary.trim().length > 0 && !isSubmitting;

  // ── Helpers ────────────────────────────────────────────────────────────────

  const filteredComponents = (components ?? []).filter((c) => {
    const q = componentSearch.toLowerCase();
    return !q || c.name.toLowerCase().includes(q);
  });

  const clearComponent = () => {
    setComponentName("");
    setComponentSearch("");
  };

  const addStep = () => {
    const step = newDraftStep();
    pendingFocusIdRef.current = step._id;
    setSteps((prev) => [...prev, step]);
  };

  const removeStep = (id: string) =>
    setSteps((prev) => (prev.length > 1 ? prev.filter((s) => s._id !== id) : prev));

  const updateStep = (id: string, field: keyof CreateTestStepInput, value: string) =>
    setSteps((prev) => prev.map((s) => (s._id === id ? { ...s, [field]: value } : s)));

  const moveStep = (from: number, to: number) => {
    setSteps((prev) => {
      const next = [...prev];
      const item = next[from];
      if (!item) return prev;
      next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const duplicateStep = (id: string) => {
    setSteps((prev) => {
      const idx = prev.findIndex((s) => s._id === id);
      if (idx < 0) return prev;
      const cloneId = String(nextId());
      pendingFocusIdRef.current = cloneId;
      const clone: DraftStep = { ...prev[idx]!, _id: cloneId };
      const next = [...prev];
      next.splice(idx + 1, 0, clone);
      return next;
    });
  };

  // Auto-focus the Action textarea of a newly added/duplicated step.
  useEffect(() => {
    if (!pendingFocusIdRef.current) return;
    const el = document.querySelector<HTMLTextAreaElement>(
      `[data-step-id="${pendingFocusIdRef.current}"]`,
    );
    if (el) {
      el.focus();
      pendingFocusIdRef.current = null;
    }
  });

  const toggleSet = (issueId: string) =>
    setSelectedSetIds((prev) => {
      const next = new Set(prev);
      if (next.has(issueId)) {
        next.delete(issueId);
      } else {
        next.add(issueId);
      }
      return next;
    });

  const clearSet = (issueId: string) =>
    setSelectedSetIds((prev) => {
      const next = new Set(prev);
      next.delete(issueId);
      return next;
    });

  const filteredSets = (testSets ?? []).filter((ts) => {
    const q = setSearch.toLowerCase();
    return !q || ts.jira.key.toLowerCase().includes(q) || ts.jira.summary.toLowerCase().includes(q);
  });

  const selectedSets = (testSets ?? []).filter((ts) => selectedSetIds.has(ts.issue_id));

  const resetForm = () => {
    setSummary("");
    setSteps([newDraftStep()]);
    setSelectedSetIds(new Set());
    setSetSearch("");
    setComponentName("");
    setComponentSearch("");
    createTest.reset();
    setCreatedKey(null);
    setLinkErrors([]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const cleanSteps: CreateTestStepInput[] = steps
      .filter((s) => s.action.trim() !== "")
      .map(({ action, data, result }) => ({
        action: action.trim(),
        ...(data?.trim() ? { data: data.trim() } : {}),
        ...(result?.trim() ? { result: result.trim() } : {}),
      }));

    const trimmedComponent = componentName.trim() || undefined;

    setLinkErrors([]);

    createTest.mutate(
      {
        projectKey,
        summary: summary.trim(),
        steps: cleanSteps,
        ...(trimmedComponent ? { component: trimmedComponent } : {}),
      },
      {
        onSuccess: async (data) => {
          const key = data.test?.jira.key ?? null;
          const newIssueId = data.test?.issue_id;
          setCreatedKey(key);

          if (newIssueId && selectedSetIds.size > 0) {
            const errors: string[] = [];
            for (const setId of selectedSetIds) {
              try {
                await api.addTestsToTestSet(setId, [newIssueId]);
              } catch (err) {
                const setLabel = testSets?.find((ts) => ts.issue_id === setId)?.jira.key ?? setId;
                errors.push(`Failed to add to ${setLabel}: ${String(err)}`);
              }
            }
            if (errors.length > 0) setLinkErrors(errors);
          }

          setSummary("");
          setSteps([newDraftStep()]);
          setSetSearch("");
          createTest.reset();
          if (!keepContext) {
            setSelectedSetIds(new Set());
            setComponentName("");
            setComponentSearch("");
          }
        },
      },
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Success banner */}
      {createdKey && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>
            Test <span className="font-semibold">{createdKey}</span> created successfully.
            {selectedSets.length === 0 &&
              linkErrors.length === 0 &&
              " Not linked to any test set."}
          </span>
          <button
            onClick={() => setCreatedKey(null)}
            className="ml-auto text-emerald-600 hover:text-emerald-800"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* Link-error banners */}
      {linkErrors.map((msg, i) => (
        <div
          key={i}
          className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <span>{msg}</span>
        </div>
      ))}

      {/* Create-error banner */}
      {createTest.isError && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <span>{String(createTest.error)}</span>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Summary */}
        <div className="space-y-1.5">
          <Label htmlFor="manual-summary">Summary *</Label>
          <Input
            id="manual-summary"
            placeholder="Short description of what is being tested"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            disabled={isSubmitting}
            required
          />
        </div>

        {/* Steps */}
        <div className="space-y-3">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Test Steps ({steps.length})
          </span>

          <div className="space-y-2">
            {steps.map((step, index) => (
              <StepRow
                key={step._id}
                step={step}
                index={index}
                total={steps.length}
                disabled={isSubmitting}
                onChange={(field, value) => updateStep(step._id, field, value)}
                onRemove={() => removeStep(step._id)}
                onDuplicate={() => duplicateStep(step._id)}
                {...(index > 0 ? { onMoveUp: () => moveStep(index, index - 1) } : {})}
                {...(index < steps.length - 1
                  ? { onMoveDown: () => moveStep(index, index + 1) }
                  : {})}
                {...(index === steps.length - 1 ? { onTabFromResult: addStep } : {})}
              />
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addStep}
            disabled={isSubmitting}
          >
            <Plus className="h-3.5 w-3.5" />
            Add step
          </Button>

          <p className="text-xs text-slate-400 dark:text-slate-500">
            Steps with an empty action will be omitted when saving.
          </p>
        </div>

        {/* Component */}
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => setShowComponentPicker((p) => !p)}
            className="flex w-full items-center gap-2 rounded-md py-0.5 text-left text-sm font-medium text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
          >
            <span className="flex-1">
              Component{" "}
              {componentName ? (
                <span className="font-normal text-slate-500">— {componentName}</span>
              ) : (
                <span className="font-normal text-slate-400">(optional)</span>
              )}
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-slate-400 transition-transform",
                showComponentPicker && "rotate-180",
              )}
            />
          </button>

          {componentName && (
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-100 py-0.5 pl-2.5 pr-1.5 text-xs font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200">
              <Tag className="h-3 w-3 text-slate-400" />
              {componentName}
              <button
                type="button"
                onClick={clearComponent}
                disabled={isSubmitting}
                className="ml-0.5 rounded-full text-slate-400 hover:text-slate-600 disabled:opacity-50"
                aria-label="Clear component"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}

          {showComponentPicker && (
            <div className="space-y-2">
              {jiraConfigured ? (
                <>
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

                    <div className="max-h-40 overflow-y-auto">
                      {componentsLoading ? (
                        <div className="flex items-center justify-center py-6">
                          <Spinner className="h-4 w-4 text-slate-400" />
                        </div>
                      ) : filteredComponents.length === 0 ? (
                        <p className="py-6 text-center text-xs text-slate-400">
                          {(components ?? []).length === 0
                            ? "No components found in this project."
                            : "No components match your filter."}
                        </p>
                      ) : (
                        filteredComponents.map((c) => (
                          <ComponentRow
                            key={c.id}
                            name={c.name}
                            selected={componentName === c.name}
                            disabled={isSubmitting}
                            onSelect={() =>
                              setComponentName((prev) => (prev === c.name ? "" : c.name))
                            }
                          />
                        ))
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    Assigned as a Jira component on the created test issue.
                  </p>
                </>
              ) : (
                <div className="space-y-1.5">
                  <Input
                    placeholder="e.g. Authentication"
                    value={componentName}
                    onChange={(e) => setComponentName(e.target.value)}
                    disabled={isSubmitting}
                  />
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    Configure Jira credentials in Settings for component autocomplete.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Test Sets */}
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => setShowSetPicker((p) => !p)}
            className="flex w-full items-center gap-2 rounded-md py-0.5 text-left text-sm font-medium text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
          >
            <span className="flex-1">
              Test Sets{" "}
              {selectedSets.length > 0 ? (
                <span className="font-normal text-slate-500">
                  — {selectedSets.length} selected
                </span>
              ) : (
                <span className="font-normal text-slate-400">(optional)</span>
              )}
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-slate-400 transition-transform",
                showSetPicker && "rotate-180",
              )}
            />
          </button>

          {selectedSets.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedSets.map((ts) => (
                <span
                  key={ts.issue_id}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-100 py-0.5 pl-2.5 pr-1.5 text-xs font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
                >
                  <Layers className="h-3 w-3 text-slate-400" />
                  {ts.jira.key}
                  <button
                    type="button"
                    onClick={() => clearSet(ts.issue_id)}
                    disabled={isSubmitting}
                    className="ml-0.5 rounded-full text-slate-400 hover:text-slate-600 disabled:opacity-50"
                    aria-label={`Remove ${ts.jira.key}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {showSetPicker && (
            <>
              <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 dark:border-slate-700">
                  <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <input
                    autoCorrect="off" autoCapitalize="off" spellCheck={false}
                    type="text"
                    placeholder="Filter test sets…"
                    value={setSearch}
                    onChange={(e) => setSetSearch(e.target.value)}
                    disabled={isSubmitting}
                    className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed dark:text-slate-200 dark:placeholder:text-slate-500"
                  />
                  {setSearch && (
                    <button
                      type="button"
                      onClick={() => setSetSearch("")}
                      className="text-slate-400 hover:text-slate-600"
                      aria-label="Clear filter"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="max-h-52 overflow-y-auto">
                  {testSetsLoading ? (
                    <div className="flex items-center justify-center py-6">
                      <Spinner className="h-4 w-4 text-slate-400" />
                    </div>
                  ) : filteredSets.length === 0 ? (
                    <p className="py-6 text-center text-xs text-slate-400">
                      {testSets?.length === 0
                        ? "No test sets found in this project."
                        : "No test sets match your filter."}
                    </p>
                  ) : (
                    filteredSets.map((ts) => (
                      <TestSetRow
                        key={ts.issue_id}
                        testSet={ts}
                        selected={selectedSetIds.has(ts.issue_id)}
                        disabled={isSubmitting}
                        onToggle={() => toggleSet(ts.issue_id)}
                      />
                    ))
                  )}
                </div>
              </div>

              <p className="text-xs text-slate-400 dark:text-slate-500">
                The new test will be added to every checked test set after it is created.
              </p>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-700">
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={keepContext}
              onChange={(e) => setKeepContext(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 accent-slate-800"
            />
            Continue creating tests — keep component and test set selections
          </label>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={!canSubmit}>
              {isSubmitting ? (
                <>
                  <Spinner className="h-4 w-4" />
                  Creating…
                </>
              ) : (
                "Create Test"
              )}
            </Button>
            <Button type="button" variant="outline" disabled={isSubmitting} onClick={resetForm}>
              Reset
            </Button>
          </div>
        </div>
      </form>
    </>
  );
}
