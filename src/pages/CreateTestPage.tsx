import { useState, useId, useRef, useEffect } from "react";
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
  Copy,
  Zap,
  ChevronDown,
  ChevronsDown,
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

interface BulkRow {
  _id: string;
  summary: string;
  testSetId: string;
}

interface BulkCreatedResult {
  rowId: string;
  summary: string;
  key: string | null;
  issueId: string | null;
  error: string | null;
}

let _bulkId = 0;
const newBulkRow = (): BulkRow => ({ _id: String(++_bulkId), summary: "", testSetId: "" });

// ── Component ─────────────────────────────────────────────────────────────────

export function CreateTestPage() {
  const projectKey = useContentProjectKey();
  const createTest = useCreateTest();

  const [activeTab, setActiveTab] = useState<"manual" | "bulk">("manual");

  // Shared data queries
  const { data: testSets, isLoading: testSetsLoading } = useGetTestSets(projectKey ?? undefined);
  const {
    data: components,
    isLoading: componentsLoading,
    isError: componentsError,
  } = useProjectComponents(projectKey);

  const formId = useId();
  const jiraConfigured = !componentsError;

  // ── Manual tab state ───────────────────────────────────────────────────────

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

  // ── Bulk tab state ─────────────────────────────────────────────────────────

  const [bulkRows, setBulkRows] = useState<BulkRow[]>([newBulkRow(), newBulkRow(), newBulkRow()]);
  const [bulkComponent, setBulkComponent] = useState("");
  const [bulkComponentSearch, setBulkComponentSearch] = useState("");
  const [isBulkCreating, setIsBulkCreating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });
  const [bulkResults, setBulkResults] = useState<BulkCreatedResult[]>([]);

  // ── Manual helpers ─────────────────────────────────────────────────────────

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
      const cloneId = String(++_nextId);
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

  // ── Bulk helpers ────────────────────────────────────────────────────────────

  const filteredBulkComponents = (components ?? []).filter((c) => {
    const q = bulkComponentSearch.toLowerCase();
    return !q || c.name.toLowerCase().includes(q);
  });

  const addBulkRow = () => setBulkRows((prev) => [...prev, newBulkRow()]);

  const applyTestSetToAll = (testSetId: string) =>
    setBulkRows((prev) => prev.map((r) => ({ ...r, testSetId })));

  const removeBulkRow = (id: string) =>
    setBulkRows((prev) => (prev.length > 1 ? prev.filter((r) => r._id !== id) : prev));

  const updateBulkRow = (
    id: string,
    field: keyof Pick<BulkRow, "summary" | "testSetId">,
    value: string,
  ) => setBulkRows((prev) => prev.map((r) => (r._id === id ? { ...r, [field]: value } : r)));

  const handleBulkCreate = async () => {
    if (!projectKey) return;
    const validRows = bulkRows.filter((r) => r.summary.trim());
    if (validRows.length === 0) return;

    setIsBulkCreating(true);
    setBulkResults([]);
    setBulkProgress({ done: 0, total: validRows.length });

    const results: BulkCreatedResult[] = [];
    const trimmedComponent = bulkComponent.trim() || undefined;

    try {
      for (const row of validRows) {
        try {
          const result = await api.createTest(
            projectKey,
            row.summary.trim(),
            [],
            trimmedComponent,
          );
          const key = result.test?.jira.key ?? null;
          const issueId = result.test?.issue_id ?? null;
          if (issueId && row.testSetId) {
            try {
              await api.addTestsToTestSet(row.testSetId, [issueId]);
            } catch {
              // non-fatal: test was created, linking just failed
            }
          }
          results.push({ rowId: row._id, summary: row.summary, key, issueId, error: null });
        } catch (err) {
          results.push({
            rowId: row._id,
            summary: row.summary,
            key: null,
            issueId: null,
            error: String(err),
          });
        }
        setBulkProgress((p) => ({ ...p, done: p.done + 1 }));
        setBulkResults([...results]);
      }
    } finally {
      setIsBulkCreating(false);
    }
  };

  const resetBulk = () => {
    setBulkRows([newBulkRow(), newBulkRow(), newBulkRow()]);
    setBulkComponent("");
    setBulkComponentSearch("");
    setBulkResults([]);
    setBulkProgress({ done: 0, total: 0 });
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
  const canBulkCreate = !isBulkCreating && bulkRows.some((r) => r.summary.trim());

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Create Test</h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Creates tests in Xray for project{" "}
          <span className="font-medium text-slate-700 dark:text-slate-200">{projectKey}</span>.
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-700">
        <nav className="-mb-px flex gap-6">
          <button
            type="button"
            onClick={() => setActiveTab("manual")}
            className={cn(
              "pb-2 text-sm font-medium transition-colors",
              activeTab === "manual"
                ? "border-b-2 border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300",
            )}
          >
            Manual
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("bulk")}
            className={cn(
              "flex items-center gap-1.5 pb-2 text-sm font-medium transition-colors",
              activeTab === "bulk"
                ? "border-b-2 border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300",
            )}
          >
            <Zap className="h-3.5 w-3.5" />
            Automated (Bulk)
          </button>
        </nav>
      </div>

      {/* ── Manual tab ──────────────────────────────────────────────────────── */}
      {activeTab === "manual" && (
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
      )}

      {/* ── Bulk tab ─────────────────────────────────────────────────────────── */}
      {activeTab === "bulk" && (
        <div className="space-y-6">
          {/* Component selector */}
          <div className="space-y-1.5">
            <Label>
              Component{" "}
              <span className="font-normal text-slate-400">(optional — applied to all tests)</span>
            </Label>

            {jiraConfigured ? (
              <div className="space-y-2">
                {bulkComponent && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-100 py-0.5 pl-2.5 pr-1.5 text-xs font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200">
                    <Tag className="h-3 w-3 text-slate-400" />
                    {bulkComponent}
                    <button
                      type="button"
                      onClick={() => {
                        setBulkComponent("");
                        setBulkComponentSearch("");
                      }}
                      disabled={isBulkCreating}
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
                      type="text"
                      placeholder="Filter components…"
                      value={bulkComponentSearch}
                      onChange={(e) => setBulkComponentSearch(e.target.value)}
                      disabled={isBulkCreating}
                      className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed dark:text-slate-200 dark:placeholder:text-slate-500"
                    />
                    {bulkComponentSearch && (
                      <button
                        type="button"
                        onClick={() => setBulkComponentSearch("")}
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
                    ) : filteredBulkComponents.length === 0 ? (
                      <p className="py-6 text-center text-xs text-slate-400">
                        {(components ?? []).length === 0
                          ? "No components found in this project."
                          : "No components match your filter."}
                      </p>
                    ) : (
                      filteredBulkComponents.map((c) => (
                        <ComponentRow
                          key={c.id}
                          name={c.name}
                          selected={bulkComponent === c.name}
                          disabled={isBulkCreating}
                          onSelect={() =>
                            setBulkComponent((prev) => (prev === c.name ? "" : c.name))
                          }
                        />
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <Input
                placeholder="e.g. Authentication"
                value={bulkComponent}
                onChange={(e) => setBulkComponent(e.target.value)}
                disabled={isBulkCreating}
              />
            )}
          </div>

          {/* Test rows */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Tests ({bulkRows.filter((r) => r.summary.trim()).length} /{" "}
                {bulkRows.length})
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addBulkRow}
                disabled={isBulkCreating}
              >
                <Plus className="h-3.5 w-3.5" />
                Add row
              </Button>
            </div>

            {/* Column headers */}
            <div className="grid grid-cols-[1fr_280px_32px_32px] gap-2 px-1">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Test name *
              </span>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Test Set
              </span>
              <span />
              <span />
            </div>

            <div className="space-y-1.5">
              {bulkRows.map((row) => (
                <div key={row._id} className="grid grid-cols-[1fr_280px_32px_32px] items-center gap-2">
                  <Input
                    placeholder="Test name"
                    value={row.summary}
                    onChange={(e) => updateBulkRow(row._id, "summary", e.target.value)}
                    disabled={isBulkCreating}
                    className="h-8 text-sm"
                  />
                  <TestSetSelect
                    value={row.testSetId}
                    testSets={testSets ?? []}
                    isLoading={testSetsLoading}
                    disabled={isBulkCreating}
                    onChange={(id) => updateBulkRow(row._id, "testSetId", id)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => applyTestSetToAll(row.testSetId)}
                    disabled={!row.testSetId || isBulkCreating || bulkRows.length === 1}
                    aria-label="Apply this test set to all rows"
                    title="Apply to all rows"
                    className="h-8 w-8 text-slate-400 hover:text-slate-700 disabled:opacity-20 dark:hover:text-slate-200"
                  >
                    <ChevronsDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeBulkRow(row._id)}
                    disabled={bulkRows.length === 1 || isBulkCreating}
                    aria-label="Remove row"
                    className="h-8 w-8 text-slate-400 hover:text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>

            <p className="text-xs text-slate-400 dark:text-slate-500">
              Rows with an empty name will be skipped.
            </p>
          </div>

          {/* Progress */}
          {isBulkCreating && (
            <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
              <Spinner className="h-4 w-4 shrink-0" />
              <span>
                Creating tests… {bulkProgress.done} / {bulkProgress.total}
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
            <Button onClick={() => void handleBulkCreate()} disabled={!canBulkCreate}>
              {isBulkCreating ? (
                <>
                  <Spinner className="h-4 w-4" />
                  Creating…
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4" />
                  Create All
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isBulkCreating}
              onClick={resetBulk}
            >
              Reset
            </Button>
          </div>

          {/* Results */}
          {bulkResults.length > 0 && (
            <div className="space-y-3">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Results — {bulkResults.filter((r) => r.key).length} created
                {bulkResults.some((r) => r.error) &&
                  `, ${bulkResults.filter((r) => r.error).length} failed`}
              </span>

              <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                <table className="w-full table-fixed text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-700">
                      <th className="w-8 px-2 py-2" />
                      <th className="w-32 px-3 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">
                        Key
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">
                        Name
                      </th>
                      <th className="w-20 px-3 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkResults.map((r) => (
                      <tr
                        key={r.rowId}
                        className="border-b border-slate-50 last:border-0 dark:border-slate-700"
                      >
                        {/* Per-row copy button */}
                        <td className="px-2 py-2">
                          {r.key && (
                            <CopyKeyButton keyValue={r.key} />
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs font-medium text-slate-700 dark:text-slate-300">
                          {r.key ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
                          {r.summary}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {r.error ? (
                            <span
                              className="flex items-center gap-1 text-red-600 dark:text-red-400"
                              title={r.error}
                            >
                              <AlertCircle className="h-3 w-3 shrink-0" />
                              Failed
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="h-3 w-3 shrink-0" />
                              Created
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── CopyKeyButton ─────────────────────────────────────────────────────────────

function CopyKeyButton({ keyValue }: { keyValue: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(keyValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      aria-label={`Copy ${keyValue}`}
      title={copied ? "Copied!" : `Copy ${keyValue}`}
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded transition-colors",
        copied
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300",
      )}
    >
      {copied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

// ── TestSetSelect ─────────────────────────────────────────────────────────────

interface TestSetSelectProps {
  value: string;
  testSets: XrayTestSet[];
  isLoading: boolean;
  disabled: boolean;
  onChange: (testSetId: string) => void;
}

function TestSetSelect({ value, testSets, isLoading, disabled, onChange }: TestSetSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 0);
  }, [open]);

  const selected = testSets.find((ts) => ts.issue_id === value);
  const filtered = testSets.filter((ts) => {
    const q = search.toLowerCase();
    return (
      !q ||
      ts.jira.key.toLowerCase().includes(q) ||
      ts.jira.summary.toLowerCase().includes(q)
    );
  });

  const select = (id: string) => {
    onChange(id);
    setOpen(false);
    setSearch("");
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        disabled={disabled || isLoading}
        className={cn(
          "flex h-8 w-full items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 text-left shadow-sm transition-colors",
          "hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "dark:border-slate-600 dark:bg-slate-800",
          open && "border-slate-400 ring-2 ring-slate-400",
        )}
      >
        {isLoading ? (
          <Spinner className="h-3 w-3 shrink-0 text-slate-400" />
        ) : selected ? (
          <>
            <span className="shrink-0 font-mono text-xs font-medium text-slate-500 dark:text-slate-400">
              {selected.jira.key}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-slate-700 dark:text-slate-200">
              {selected.jira.summary}
            </span>
          </>
        ) : (
          <span className="flex-1 text-xs text-slate-400 dark:text-slate-500">
            — No test set —
          </span>
        )}
        <ChevronDown
          className={cn(
            "ml-auto h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
          {/* Search */}
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 dark:border-slate-700">
            <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Filter test sets…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none dark:text-slate-200 dark:placeholder:text-slate-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="text-slate-400 hover:text-slate-600"
                aria-label="Clear filter"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Options */}
          <div className="max-h-52 overflow-y-auto">
            {/* Clear option */}
            <button
              type="button"
              onClick={() => select("")}
              className={cn(
                "w-full px-3 py-2 text-left text-xs text-slate-400 transition-colors hover:bg-slate-50 dark:text-slate-500 dark:hover:bg-slate-700",
                !value && "bg-slate-50 dark:bg-slate-700",
              )}
            >
              — No test set —
            </button>

            {filtered.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-400 dark:text-slate-500">
                No test sets match your filter.
              </p>
            ) : (
              filtered.map((ts) => (
                <button
                  key={ts.issue_id}
                  type="button"
                  onClick={() => select(ts.issue_id)}
                  className={cn(
                    "flex w-full items-baseline gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-slate-50 dark:hover:bg-slate-700",
                    value === ts.issue_id && "bg-slate-50 dark:bg-slate-700",
                  )}
                >
                  <span className="shrink-0 font-mono text-slate-500 dark:text-slate-400">
                    {ts.jira.key}
                  </span>
                  <span className="min-w-0 truncate text-slate-700 dark:text-slate-200">
                    {ts.jira.summary}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
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
        selected ? "bg-slate-50 dark:bg-slate-700" : "hover:bg-slate-50 dark:hover:bg-slate-700",
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
      <span className="shrink-0 font-mono text-xs text-slate-500 dark:text-slate-400">
        {testSet.jira.key}
      </span>
      <span className="truncate text-slate-700 dark:text-slate-300">{testSet.jira.summary}</span>
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
        selected ? "bg-slate-50 dark:bg-slate-700" : "hover:bg-slate-50 dark:hover:bg-slate-700",
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
      <span className="truncate text-slate-700 dark:text-slate-300">{name}</span>
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
  onDuplicate: () => void;
  onMoveUp?: (() => void) | undefined;
  onMoveDown?: (() => void) | undefined;
  /** Called when Tab is pressed on the Expected Result field (last step only). */
  onTabFromResult?: (() => void) | undefined;
}

function StepRow({
  step,
  index,
  total,
  disabled,
  onChange,
  onRemove,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onTabFromResult,
}: StepRowProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800",
        disabled && "opacity-60",
      )}
    >
      {/* Step header */}
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 dark:border-slate-700">
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

        <span className="shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">
          Step {index + 1}
          {total > 1 ? ` / ${total}` : ""}
        </span>

        <div className="ml-auto flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onDuplicate}
            disabled={disabled}
            aria-label="Duplicate step"
            title="Duplicate step"
            className="h-7 w-7 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
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
          <Label className="text-xs text-slate-500 dark:text-slate-400">Action *</Label>
          <textarea
            data-step-id={step._id}
            value={step.action}
            onChange={(e) => onChange("action", e.target.value)}
            disabled={disabled}
            placeholder="What to do in this step"
            rows={2}
            className="w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus-visible:ring-slate-500"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-slate-500 dark:text-slate-400">Test Data</Label>
          <textarea
            value={step.data ?? ""}
            onChange={(e) => onChange("data", e.target.value)}
            disabled={disabled}
            placeholder="Input / test data (optional)"
            rows={2}
            className="w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus-visible:ring-slate-500"
          />
        </div>

        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs text-slate-500 dark:text-slate-400">Expected Result</Label>
          <textarea
            value={step.result ?? ""}
            onChange={(e) => onChange("result", e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Tab" && !e.shiftKey && onTabFromResult) {
                e.preventDefault();
                onTabFromResult();
              }
            }}
            disabled={disabled}
            placeholder="Expected outcome (optional)"
            rows={2}
            className="w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus-visible:ring-slate-500"
          />
        </div>
      </div>
    </div>
  );
}

export default CreateTestPage;
