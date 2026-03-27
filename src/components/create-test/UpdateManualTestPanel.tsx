import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUiStore } from "@/stores/uiStore";
import { AlertTriangle, Plus, RotateCcw, Save, Search } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  queryKeys,
  useGetTests,
  useTestDetail,
  useUpdateTestStep,
  useAddTestStep,
  useRemoveTestStep,
} from "@/services/queries";
import type { XrayTestStepDefinition } from "@/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/utils";
import { Toast } from "@/components/ui/toast";
import { showToast } from "@/components/ui/toast-utils";
import type { ToastMessage } from "@/components/ui/toast-utils";
import { StepRow } from "./StepRow";
import { newDraftStep } from "./types";
import type { DraftStep } from "./types";

interface Props {
  projectKey: string;
}

/**
 * A draft step for editing: extends `DraftStep` with an optional Xray step ID.
 * Steps loaded from the API have `_xrayId`; newly added steps do not.
 */
interface EditDraftStep extends DraftStep {
  _xrayId?: string | undefined;
}

function stepFromDefinition(step: XrayTestStepDefinition): EditDraftStep {
  return {
    ...newDraftStep(),
    _xrayId: step.id,
    action: step.action ?? "",
    data: step.data ?? "",
    result: step.result ?? "",
  };
}

function stepsChanged(original: EditDraftStep[], draft: EditDraftStep[]): boolean {
  if (original.length !== draft.length) return true;
  return original.some((orig, i) => {
    const d = draft[i];
    if (!d) return true;
    return (
      orig._xrayId !== d._xrayId ||
      orig.action !== d.action ||
      orig.data !== d.data ||
      orig.result !== d.result
    );
  });
}

export function UpdateManualTestPanel({ projectKey }: Props) {
  const queryClient = useQueryClient();
  const { confirmedLoadProjects, confirmLoadProject } = useUiStore();

  // ── Load confirmation — shared with TestsPage via Zustand ────────────────
  const hasCachedTests = !!queryClient.getQueryData(queryKeys.tests(projectKey));
  const isConfirmed = hasCachedTests || confirmedLoadProjects.has(projectKey);
  const [loadConfirmed, setLoadConfirmed] = useState<boolean | null>(isConfirmed ? true : false);

  // Sync: if TestsPage confirms for the same project key, skip the modal here too.
  useEffect(() => {
    if (confirmedLoadProjects.has(projectKey) && loadConfirmed === false) {
      setLoadConfirmed(true);
    }
  }, [confirmedLoadProjects, projectKey, loadConfirmed]);

  // ── Filters ───────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [selectedComponent, setSelectedComponent] = useState<string>("__all__");

  // ── Selected test ─────────────────────────────────────────────────────────
  const [selectedTestKey, setSelectedTestKey] = useState<string | null>(null);
  const [selectedTestIssueId, setSelectedTestIssueId] = useState<string | null>(null);

  // ── Toast ─────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<ToastMessage | null>(null);

  // ── Draft steps ───────────────────────────────────────────────────────────
  const [draftSteps, setDraftSteps] = useState<EditDraftStep[]>([]);
  const [originalSteps, setOriginalSteps] = useState<EditDraftStep[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // ── Data fetching ─────────────────────────────────────────────────────────
  const { data: allTests } = useGetTests(projectKey, loadConfirmed === true);
  const { data: testDetail, isLoading: detailLoading } = useTestDetail(selectedTestKey);

  const updateTestStep = useUpdateTestStep();
  const addTestStep = useAddTestStep();
  const removeTestStep = useRemoveTestStep();

  // ── Derived: only Manual tests ────────────────────────────────────────────
  const manualTests = (allTests ?? []).filter((t) => t.test_type?.name === "Manual");

  // Unique component names present in the loaded manual tests
  const componentOptions: string[] = Array.from(
    new Set(
      manualTests.flatMap((t) => (t.jira.components ?? []).map((c) => c.name)),
    ),
  ).sort();

  // Apply text + component filters
  const filtered = manualTests.filter((t) => {
    const q = search.trim().toLowerCase();
    const matchesText =
      !q ||
      t.jira.key.toLowerCase().includes(q) ||
      t.jira.summary.toLowerCase().includes(q);
    const matchesComponent =
      selectedComponent === "__all__" ||
      (t.jira.components ?? []).some((c) => c.name === selectedComponent);
    return matchesText && matchesComponent;
  });

  // ── Sync draft when test detail loads ────────────────────────────────────
  useEffect(() => {
    if (!testDetail) {
      setDraftSteps([]);
      setOriginalSteps([]);
      return;
    }
    const steps: EditDraftStep[] = (testDetail.steps ?? []).map((s) =>
      stepFromDefinition(s),
    );
    setDraftSteps(steps);
    setOriginalSteps(steps);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testDetail]);

  // ── Step handlers ─────────────────────────────────────────────────────────
  const handleUpdateStep = useCallback(
    (id: string, field: keyof DraftStep, value: string) => {
      setDraftSteps((prev) =>
        prev.map((s) => (s._id === id ? { ...s, [field]: value } : s)),
      );
    },
    [],
  );

  const handleRemoveStep = useCallback((id: string) => {
    setDraftSteps((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((s) => s._id !== id);
    });
  }, []);

  const handleDuplicateStep = useCallback((id: string) => {
    setDraftSteps((prev) => {
      const idx = prev.findIndex((s) => s._id === id);
      if (idx === -1) return prev;
      const src = prev[idx];
      if (!src) return prev;
      const copy: EditDraftStep = {
        ...newDraftStep(),
        action: src.action,
        ...(src.data !== undefined ? { data: src.data } : {}),
        ...(src.result !== undefined ? { result: src.result } : {}),
        // no _xrayId — it's a new step
      };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  }, []);

  const handleAddStep = useCallback(() => {
    setDraftSteps((prev) => [...prev, { ...newDraftStep() }]);
  }, []);

  const handleReset = useCallback(() => {
    setDraftSteps(originalSteps.map((s) => ({ ...s })));
  }, [originalSteps]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!selectedTestKey || !selectedTestIssueId) return;
    setIsSaving(true);
    try {
      // Steps removed: in original but no longer in draft (matched by _xrayId)
      const draftXrayIds = new Set(draftSteps.map((s) => s._xrayId).filter(Boolean));
      const removedSteps = originalSteps.filter(
        (s) => s._xrayId && !draftXrayIds.has(s._xrayId),
      );

      // Steps modified: same _xrayId, different content
      const modifiedSteps = draftSteps.filter((d) => {
        if (!d._xrayId) return false;
        const orig = originalSteps.find((o) => o._xrayId === d._xrayId);
        return (
          orig &&
          (orig.action !== d.action || orig.data !== d.data || orig.result !== d.result)
        );
      });

      // Steps added: no _xrayId
      const addedSteps = draftSteps.filter((d) => !d._xrayId);

      for (const s of removedSteps) {
        await removeTestStep.mutateAsync({
          issueId: selectedTestIssueId,
          stepId: s._xrayId!,
          testKey: selectedTestKey,
        });
      }
      for (const s of modifiedSteps) {
        const vars: Parameters<typeof updateTestStep.mutateAsync>[0] = {
          issueId: selectedTestIssueId,
          stepId: s._xrayId!,
          testKey: selectedTestKey,
          action: s.action,
        };
        if (s.data) vars.data = s.data;
        if (s.result) vars.result = s.result;
        await updateTestStep.mutateAsync(vars);
      }
      for (const s of addedSteps) {
        const vars: Parameters<typeof addTestStep.mutateAsync>[0] = {
          issueId: selectedTestIssueId,
          testKey: selectedTestKey,
          action: s.action,
        };
        if (s.data) vars.data = s.data;
        if (s.result) vars.result = s.result;
        await addTestStep.mutateAsync(vars);
      }

      showToast(setToast, "Test steps saved successfully.", "success");
    } catch (err) {
      showToast(setToast, `Failed to save steps: ${String(err)}`, "error");
    } finally {
      setIsSaving(false);
    }
  }, [
    selectedTestKey,
    selectedTestIssueId,
    draftSteps,
    originalSteps,
    removeTestStep,
    updateTestStep,
    addTestStep,
  ]);

  const isDirty = stepsChanged(originalSteps, draftSteps);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Load confirmation dialog */}
      <Dialog.Root
        open={loadConfirmed === false}
        onOpenChange={(open) => {
          if (!open) setLoadConfirmed(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-slate-200 bg-white p-6 shadow-lg dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-500" />
              <div className="space-y-3">
                <Dialog.Title className="text-lg font-semibold dark:text-slate-100">
                  Load all tests?
                </Dialog.Title>
                <Dialog.Description className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  Loading every test for{" "}
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {projectKey}
                  </span>{" "}
                  requires fetching all pages from the Xray API. Depending on the number of
                  tests this can take a{" "}
                  <span className="font-medium">significant amount of time</span>.
                </Dialog.Description>
                <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  The results are cached for the rest of this session, so this is a{" "}
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    one-time operation per app launch
                  </span>{" "}
                  unless you explicitly reload.
                </p>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <Dialog.Close asChild>
                    <Button variant="outline" size="sm">
                      Cancel
                    </Button>
                  </Dialog.Close>
                  <Button
                    size="sm"
                    onClick={() => {
                      setLoadConfirmed(true);
                      confirmLoadProject(projectKey);
                    }}
                  >
                    Load Tests
                  </Button>
                </div>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Toast message={toast} />

      {/* Two-column layout */}
      <div className="flex gap-4" style={{ height: "calc(100vh - 220px)", minHeight: 400 }}>
        {/* ── Left panel: Manual test list ─────────────────────────── */}
        <div className="flex w-72 shrink-0 flex-col rounded-lg border border-slate-200 dark:border-slate-700">
          {/* Filters */}
          <div className="space-y-2 border-b border-slate-200 p-3 dark:border-slate-700">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search tests…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              />
            </div>
            {componentOptions.length > 0 && (
              <select
                value={selectedComponent}
                onChange={(e) => setSelectedComponent(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="__all__">All components</option>
                {componentOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Test list */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loadConfirmed !== true ? (
              <div className="flex h-full items-center justify-center p-4 text-center text-sm text-slate-400">
                <div className="space-y-2">
                  <p>Load tests to see the list.</p>
                  <Button size="sm" variant="outline" onClick={() => setLoadConfirmed(false)} title="Show load confirmation dialog">
                    Load Tests
                  </Button>
                </div>
              </div>
            ) : filtered.length === 0 ? (
              <p className="p-4 text-center text-sm text-slate-400">No manual tests found.</p>
            ) : (
              filtered.map((test) => (
                <button
                  key={test.issue_id}
                  type="button"
                  onClick={() => {
                    setSelectedTestKey(test.jira.key);
                    setSelectedTestIssueId(test.issue_id);
                  }}
                  className={cn(
                    "w-full border-b border-slate-100 px-3 py-2 text-left last:border-b-0 dark:border-slate-700",
                    selectedTestKey === test.jira.key
                      ? "bg-slate-100 dark:bg-slate-700"
                      : "hover:bg-slate-50 dark:hover:bg-slate-800",
                  )}
                >
                  <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                    {test.jira.summary}
                  </p>
                  <p className="font-mono text-xs text-slate-400">{test.jira.key}</p>
                </button>
              ))
            )}
          </div>
        </div>

        {/* ── Right panel: Step editor ──────────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col rounded-lg border border-slate-200 dark:border-slate-700">
          {!selectedTestKey ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              ← Select a manual test to edit its steps.
            </div>
          ) : detailLoading ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              Loading steps…
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
                <p className="min-w-0 truncate text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {selectedTestKey} —{" "}
                  {draftSteps.length} step{draftSteps.length !== 1 ? "s" : ""}
                </p>
                <div className="ml-3 flex shrink-0 items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleReset}
                    disabled={!isDirty || isSaving}
                    title="Discard changes"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reset
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void handleSave()}
                    disabled={!isDirty || isSaving}
                  >
                    <Save className="h-3.5 w-3.5" />
                    {isSaving ? "Saving…" : "Save Changes"}
                  </Button>
                </div>
              </div>

              {/* Step list */}
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                {draftSteps.length === 0 ? (
                  <p className="text-sm text-slate-400">No steps yet. Add one below.</p>
                ) : (
                  draftSteps.map((step, idx) => (
                    <StepRow
                      key={step._id}
                      step={step}
                      index={idx}
                      total={draftSteps.length}
                      disabled={isSaving}
                      onChange={(field, value) => handleUpdateStep(step._id, field, value)}
                      onRemove={() => handleRemoveStep(step._id)}
                      onDuplicate={() => handleDuplicateStep(step._id)}
                    />
                  ))
                )}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddStep}
                  disabled={isSaving}
                  className="w-full"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Step
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
