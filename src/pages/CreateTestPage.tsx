import { useState, useId } from "react";
import {
  Plus,
  Trash2,
  GripVertical,
  CheckCircle2,
  AlertCircle,
  Search,
  X,
  Layers,
  Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useCreateTest, useGetTestSets, useProjectComponents } from "@/services/queries";
import * as api from "@/services/tauri";
import { useContentProjectKey } from "@/hooks/useProjectKey";
import { cn } from "@/components/ui/utils";
import type { CreateTestStepInput, XrayTestSet } from "@/types";

// ── Local types ───────────────────────────────────────────────────────────────

interface DraftStep extends CreateTestStepInput {
  /** Client-side key so React keys stay stable on reorder. */
  _id: string;
}

let _nextId = 0;
const newDraftStep = (): DraftStep => ({
  _id: String(++_nextId),
  action: "",
  data: "",
  result: "",
});

// ── Component ─────────────────────────────────────────────────────────────────

export function CreateTestPage() {
  const projectKey = useContentProjectKey();
  const createTest = useCreateTest();

  // Test sets available for selection
  const { data: testSets, isLoading: testSetsLoading } = useGetTestSets(projectKey ?? undefined);

  // Jira components — only available when Jira credentials are configured.
  // On error (Jira not configured) we fall back to free-text.
  const {
    data: components,
    isLoading: componentsLoading,
    isError: componentsError,
  } = useProjectComponents(projectKey);

  const formId = useId();

  const [summary, setSummary] = useState("");
  const [steps, setSteps] = useState<DraftStep[]>([newDraftStep()]);
  const [selectedSetIds, setSelectedSetIds] = useState<Set<string>>(new Set());
  const [setSearch, setSetSearch] = useState("");

  // Component selection
  const [componentName, setComponentName] = useState("");
  const [componentSearch, setComponentSearch] = useState("");

  // "Continue creating" — when checked, component + test-set selections are kept after submit
  const [keepContext, setKeepContext] = useState(false);

  // After a successful submission we show a success banner with the created key.
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  // Errors that occur while linking test sets (post-create) are collected here.
  const [linkErrors, setLinkErrors] = useState<string[]>([]);

  // ── Component helpers ──────────────────────────────────────────────────────

  const jiraConfigured = !componentsError;
  const filteredComponents = (components ?? []).filter((c) => {
    const q = componentSearch.toLowerCase();
    return !q || c.name.toLowerCase().includes(q);
  });

  const clearComponent = () => {
    setComponentName("");
    setComponentSearch("");
  };

  // ── Step helpers ───────────────────────────────────────────────────────────

  const addStep = () => setSteps((prev) => [...prev, newDraftStep()]);

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

  // ── Test set helpers ───────────────────────────────────────────────────────

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

  // ── Reset ──────────────────────────────────────────────────────────────────

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

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectKey) return;

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

          // Link to each selected test set sequentially (failures collected, not fatal).
          if (newIssueId && selectedSetIds.size > 0) {
            const errors: string[] = [];
            for (const setId of selectedSetIds) {
              try {
                await api.addTestsToTestSet(setId, [newIssueId]);
              } catch (err) {
                const setLabel =
                  testSets?.find((ts) => ts.issue_id === setId)?.jira.key ?? setId;
                errors.push(`Failed to add to ${setLabel}: ${String(err)}`);
              }
            }
            if (errors.length > 0) setLinkErrors(errors);
          }

          // Reset form — if "continue creating" is on, keep component + test set.
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

  // ── Guards ─────────────────────────────────────────────────────────────────

  if (!projectKey) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        Set a Project Key in Settings to create tests.
      </div>
    );
  }

  const isSubmitting = createTest.isPending;
  const canSubmit = summary.trim().length > 0 && !isSubmitting;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Create Manual Test</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Creates a Manual test in Xray for project{" "}
          <span className="font-medium text-slate-700">{projectKey}</span>.
        </p>
      </div>

      {/* Success banner */}
      {createdKey && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>
            Test <span className="font-semibold">{createdKey}</span> created successfully.
            {selectedSets.length === 0 && linkErrors.length === 0 && " Not linked to any test set."}
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
          className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <span>{msg}</span>
        </div>
      ))}

      {/* Create-error banner */}
      {createTest.isError && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <span>{String(createTest.error)}</span>
        </div>
      )}

      {/* Form */}
      <form id={formId} onSubmit={handleSubmit} className="space-y-6">
        {/* Summary */}
        <div className="space-y-1.5">
          <Label htmlFor="summary">Summary *</Label>
          <Input
            id="summary"
            placeholder="Short description of what is being tested"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            disabled={isSubmitting}
            required
          />
        </div>

        {/* Component */}
        <div className="space-y-1.5">
          <Label>
            Component{" "}
            <span className="font-normal text-slate-400">(optional)</span>
          </Label>

          {jiraConfigured ? (
            /* Jira configured — same panel+chip pattern as Test Sets */
            <div className="space-y-2">
              {/* Selected chip */}
              {componentName && (
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-100 py-0.5 pl-2.5 pr-1.5 text-xs font-medium text-slate-700">
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

              {/* Filterable panel */}
              <div className="rounded-lg border border-slate-200 bg-white">
                <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
                  <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Filter components…"
                    value={componentSearch}
                    onChange={(e) => setComponentSearch(e.target.value)}
                    disabled={isSubmitting}
                    className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed"
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

              <p className="text-xs text-slate-400">
                Assigned as a Jira component on the created test issue.
              </p>
            </div>
          ) : (
            /* Jira not configured — plain free-text input */
            <div className="space-y-1.5">
              <Input
                placeholder="e.g. Authentication"
                value={componentName}
                onChange={(e) => setComponentName(e.target.value)}
                disabled={isSubmitting}
              />
              <p className="text-xs text-slate-400">
                Configure Jira credentials in Settings for component autocomplete.
              </p>
            </div>
          )}
        </div>

        {/* Test Sets picker */}
        <div className="space-y-2">
          <Label>
            Test Sets{" "}
            <span className="font-normal text-slate-400">(optional)</span>
          </Label>

          {/* Selected chips */}
          {selectedSets.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedSets.map((ts) => (
                <span
                  key={ts.issue_id}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-100 py-0.5 pl-2.5 pr-1.5 text-xs font-medium text-slate-700"
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

          {/* Filterable list */}
          <div className="rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <input
                type="text"
                placeholder="Filter test sets…"
                value={setSearch}
                onChange={(e) => setSetSearch(e.target.value)}
                disabled={isSubmitting}
                className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed"
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

          <p className="text-xs text-slate-400">
            The new test will be added to every checked test set after it is created.
          </p>
        </div>

        {/* Steps */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">
              Test Steps ({steps.length})
            </span>
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
          </div>

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
                {...(index > 0 ? { onMoveUp: () => moveStep(index, index - 1) } : {})}
                {...(index < steps.length - 1
                  ? { onMoveDown: () => moveStep(index, index + 1) }
                  : {})}
              />
            ))}
          </div>

          <p className="text-xs text-slate-400">
            Steps with an empty action will be omitted when saving.
          </p>
        </div>

        {/* Actions */}
        <div className="space-y-3 border-t border-slate-200 pt-4">
          {/* Continue creating checkbox */}
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-700">
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
    </div>
  );
}

// ── TestSetRow ────────────────────────────────────────────────────────────────

interface TestSetRowProps {
  testSet: XrayTestSet;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}

function TestSetRow({ testSet, selected, disabled, onToggle }: TestSetRowProps) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-3 px-3 py-2 text-sm transition-colors",
        selected ? "bg-slate-50" : "hover:bg-slate-50",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        disabled={disabled}
        className="h-4 w-4 rounded border-slate-300 text-slate-900 accent-slate-800"
      />
      <span className="shrink-0 font-mono text-xs text-slate-500">{testSet.jira.key}</span>
      <span className="truncate text-slate-700">{testSet.jira.summary}</span>
    </label>
  );
}

// ── ComponentRow ──────────────────────────────────────────────────────────────

interface ComponentRowProps {
  name: string;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}

function ComponentRow({ name, selected, disabled, onSelect }: ComponentRowProps) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-3 px-3 py-2 text-sm transition-colors",
        selected ? "bg-slate-50" : "hover:bg-slate-50",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <input
        type="radio"
        checked={selected}
        onChange={onSelect}
        disabled={disabled}
        className="h-4 w-4 border-slate-300 text-slate-900 accent-slate-800"
      />
      <Tag className="h-3 w-3 shrink-0 text-slate-400" />
      <span className="truncate text-slate-700">{name}</span>
    </label>
  );
}

// ── StepRow ───────────────────────────────────────────────────────────────────

interface StepRowProps {
  step: DraftStep;
  index: number;
  total: number;
  disabled: boolean;
  onChange: (field: keyof CreateTestStepInput, value: string) => void;
  onRemove: () => void;
  onMoveUp?: (() => void) | undefined;
  onMoveDown?: (() => void) | undefined;
}

function StepRow({
  step,
  index,
  total,
  disabled,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: StepRowProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-slate-200 bg-white shadow-sm",
        disabled && "opacity-60",
      )}
    >
      {/* Step header */}
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
        <div className="flex shrink-0 flex-col items-center gap-0.5">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!onMoveUp || disabled}
            aria-label="Move step up"
            className="rounded px-0.5 text-slate-300 hover:text-slate-500 disabled:cursor-not-allowed disabled:opacity-30"
          >
            ▲
          </button>
          <GripVertical className="h-3.5 w-3.5 text-slate-300" />
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!onMoveDown || disabled}
            aria-label="Move step down"
            className="rounded px-0.5 text-slate-300 hover:text-slate-500 disabled:cursor-not-allowed disabled:opacity-30"
          >
            ▼
          </button>
        </div>

        <span className="shrink-0 text-xs font-semibold text-slate-500">
          Step {index + 1}
          {total > 1 ? ` / ${total}` : ""}
        </span>

        <div className="ml-auto">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            disabled={total === 1 || disabled}
            aria-label="Remove step"
            className="h-7 w-7 text-slate-400 hover:text-red-500"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Step fields */}
      <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-3">
        <div className="space-y-1 sm:col-span-3">
          <Label className="text-xs text-slate-500">Action *</Label>
          <textarea
            value={step.action}
            onChange={(e) => onChange("action", e.target.value)}
            disabled={disabled}
            placeholder="What to do in this step"
            rows={2}
            className="w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-slate-500">Test Data</Label>
          <textarea
            value={step.data ?? ""}
            onChange={(e) => onChange("data", e.target.value)}
            disabled={disabled}
            placeholder="Input / test data (optional)"
            rows={2}
            className="w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs text-slate-500">Expected Result</Label>
          <textarea
            value={step.result ?? ""}
            onChange={(e) => onChange("result", e.target.value)}
            disabled={disabled}
            placeholder="Expected outcome (optional)"
            rows={2}
            className="w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
      </div>
    </div>
  );
}


