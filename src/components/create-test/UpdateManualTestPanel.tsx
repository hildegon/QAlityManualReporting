import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUiStore } from "@/stores/uiStore";
import { AlertTriangle, ChevronDown, Plus, RotateCcw, Save, Search } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  queryKeys,
  useGetTests,
  useTestDetail,
  useUpdateTestStep,
  useAddTestStep,
  useRemoveTestStep,
  useUpdateTestType,
} from "@/services/queries";
import type { XrayTestStepDefinition } from "@/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/utils";
import { Toast } from "@/components/ui/toast";
import { showToast } from "@/components/ui/toast-utils";
import type { ToastMessage } from "@/components/ui/toast-utils";
import { StepRow } from "./StepRow";
import type { StepEditStatus } from "./StepRow";
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

const TEST_TYPES = ["Manual", "Generic", "Cucumber"] as const;
type TestTypeName = (typeof TEST_TYPES)[number];

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

const TYPE_COLORS: Record<TestTypeName, string> = {
  Manual: "bg-blue-50 text-blue-700 border-blue-200",
  Generic: "bg-slate-100 text-slate-600 border-slate-300",
  Cucumber: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

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
  const [typeFilter, setTypeFilter] = useState<"__all__" | TestTypeName>("__all__");

  // ── Selected test (single edit) ──────────────────────────────────────────
  const [selectedTestKey, setSelectedTestKey] = useState<string | null>(null);
  const [selectedTestIssueId, setSelectedTestIssueId] = useState<string | null>(null);

  // ── Multi-select (bulk type change) ──────────────────────────────────────
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [bulkTargetType, setBulkTargetType] = useState<TestTypeName | null>(null);
  const [isBulkChanging, setIsBulkChanging] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });

  // ── Toast ─────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<ToastMessage | null>(null);

  // ── Draft steps ───────────────────────────────────────────────────────────
  const [draftSteps, setDraftSteps] = useState<EditDraftStep[]>([]);
  const [originalSteps, setOriginalSteps] = useState<EditDraftStep[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // ── Test type change ──────────────────────────────────────────────────────
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [isSavingType, setIsSavingType] = useState(false);
  const updateTestType = useUpdateTestType();

  // ── Data fetching ─────────────────────────────────────────────────────────
  const { data: allTests } = useGetTests(projectKey, loadConfirmed === true);
  const { data: testDetail, isLoading: detailLoading } = useTestDetail(selectedTestKey);

  const updateTestStep = useUpdateTestStep();
  const addTestStep = useAddTestStep();
  const removeTestStep = useRemoveTestStep();

  // ── Derived: show Manual + Generic + Cucumber tests ────────────────────────
  const editableTests = (allTests ?? []).filter((t) => {
    const typeName = t.test_type?.name;
    return typeName === "Manual" || typeName === "Generic" || typeName === "Cucumber";
  });

  // Unique component names present in the loaded editable tests
  const componentOptions: string[] = Array.from(
    new Set(
      editableTests.flatMap((t) => (t.jira.components ?? []).map((c) => c.name)),
    ),
  ).sort();

  // Apply text + component + type filters
  const filtered = editableTests.filter((t) => {
    const q = search.trim().toLowerCase();
    const matchesText =
      !q ||
      t.jira.key.toLowerCase().includes(q) ||
      t.jira.summary.toLowerCase().includes(q);
    const matchesComponent =
      selectedComponent === "__all__" ||
      (t.jira.components ?? []).some((c) => c.name === selectedComponent);
    const matchesType =
      typeFilter === "__all__" || t.test_type?.name === typeFilter;
    return matchesText && matchesComponent && matchesType;
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
      const draftXrayIds = new Set(draftSteps.map((s) => s._xrayId).filter(Boolean));
      const removedSteps = originalSteps.filter(
        (s) => s._xrayId && !draftXrayIds.has(s._xrayId),
      );
      const modifiedSteps = draftSteps.filter((d) => {
        if (!d._xrayId) return false;
        const orig = originalSteps.find((o) => o._xrayId === d._xrayId);
        return (
          orig &&
          (orig.action !== d.action || orig.data !== d.data || orig.result !== d.result)
        );
      });
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

  const handleChangeType = useCallback(
    async (newType: TestTypeName) => {
      if (!selectedTestKey || !selectedTestIssueId) return;
      setTypeMenuOpen(false);
      setIsSavingType(true);
      try {
        await updateTestType.mutateAsync({
          issueId: selectedTestIssueId,
          testKey: selectedTestKey,
          projectKey,
          newType,
        });
        showToast(setToast, `Test type changed to ${newType}.`, "success");
      } catch (err) {
        showToast(setToast, `Failed to change type: ${String(err)}`, "error");
      } finally {
        setIsSavingType(false);
      }
    },
    [selectedTestKey, selectedTestIssueId, projectKey, updateTestType],
  );

  // ── Bulk type change ────────────────────────────────────────────────────
  const toggleChecked = useCallback((issueId: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(issueId)) next.delete(issueId);
      else next.add(issueId);
      return next;
    });
  }, []);

  const toggleAllFiltered = useCallback(() => {
    setCheckedIds((prev) => {
      const allChecked = filtered.every((t) => prev.has(t.issue_id));
      if (allChecked) {
        // uncheck all filtered
        const next = new Set(prev);
        for (const t of filtered) next.delete(t.issue_id);
        return next;
      }
      // check all filtered
      const next = new Set(prev);
      for (const t of filtered) next.add(t.issue_id);
      return next;
    });
  }, [filtered]);

  const handleBulkChangeType = useCallback(
    async (targetType: TestTypeName) => {
      const targets = editableTests.filter((t) => checkedIds.has(t.issue_id));
      if (targets.length === 0) return;
      setIsBulkChanging(true);
      setBulkProgress({ done: 0, total: targets.length });
      let successCount = 0;
      let failCount = 0;
      for (const t of targets) {
        try {
          await updateTestType.mutateAsync({
            issueId: t.issue_id,
            testKey: t.jira.key,
            projectKey,
            newType: targetType,
          });
          successCount++;
        } catch {
          failCount++;
        }
        setBulkProgress((p) => ({ ...p, done: p.done + 1 }));
      }
      setIsBulkChanging(false);
      setBulkTargetType(null);
      setCheckedIds(new Set());
      if (failCount === 0) {
        showToast(setToast, `Changed ${successCount} test(s) to ${targetType}.`, "success");
      } else {
        showToast(
          setToast,
          `${successCount} changed, ${failCount} failed.`,
          failCount === targets.length ? "error" : "success",
        );
      }
    },
    [checkedIds, editableTests, projectKey, updateTestType],
  );

  const isDirty = stepsChanged(originalSteps, draftSteps);

  const stepEditStatus = useCallback(
    (step: EditDraftStep): StepEditStatus => {
      if (!step._xrayId) return "new";
      const orig = originalSteps.find((o) => o._xrayId === step._xrayId);
      if (!orig) return "new";
      if (
        orig.action !== step.action ||
        orig.data !== step.data ||
        orig.result !== step.result
      ) {
        return "modified";
      }
      return "unchanged";
    },
    [originalSteps],
  );

  // Current type of the selected test (from loaded detail or from test list)
  const selectedTestType = (testDetail?.test_type?.name ??
    editableTests.find((t) => t.jira.key === selectedTestKey)?.test_type?.name ??
    "Manual") as TestTypeName;

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
        {/* ── Left panel: test list ────────────────────────────────── */}
        <div className="flex w-72 shrink-0 flex-col rounded-lg border border-slate-200 dark:border-slate-700">
          {/* Filters */}
          <div className="space-y-2 border-b border-slate-200 p-3 dark:border-slate-700">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                autoCorrect="off" autoCapitalize="off" spellCheck={false}
                type="text"
                placeholder="Search tests…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              />
            </div>
            {/* Type filter pills */}
            <div className="flex flex-wrap gap-1">
              {(["__all__", ...TEST_TYPES] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTypeFilter(t)}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors",
                    typeFilter === t
                      ? "border-slate-600 bg-slate-700 text-white dark:border-slate-400 dark:bg-slate-500"
                      : "border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400",
                  )}
                >
                  {t === "__all__" ? "All" : t}
                </button>
              ))}
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

          {/* Select-all + bulk bar */}
          {loadConfirmed === true && filtered.length > 0 && (
            <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-1.5 dark:border-slate-700">
              <input
                type="checkbox"
                checked={filtered.length > 0 && filtered.every((t) => checkedIds.has(t.issue_id))}
                onChange={toggleAllFiltered}
                disabled={isBulkChanging}
                className="h-3.5 w-3.5 rounded border-slate-300 accent-slate-700"
              />
              <span className="text-[10px] text-slate-400">
                {checkedIds.size > 0 ? `${checkedIds.size} selected` : "Select all"}
              </span>
              {checkedIds.size > 0 && !isBulkChanging && (
                <div className="ml-auto flex items-center gap-1">
                  <span className="text-[10px] text-slate-400">→</span>
                  {TEST_TYPES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setBulkTargetType(t)}
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[9px] font-semibold transition-colors",
                        bulkTargetType === t
                          ? TYPE_COLORS[t]
                          : "border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400",
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
              {isBulkChanging && (
                <span className="ml-auto text-[10px] font-medium text-slate-500">
                  {bulkProgress.done}/{bulkProgress.total}…
                </span>
              )}
            </div>
          )}

          {/* Bulk confirm bar */}
          {bulkTargetType && checkedIds.size > 0 && !isBulkChanging && (
            <div className="flex items-center justify-between border-b border-amber-200 bg-amber-50 px-3 py-1.5 dark:border-amber-800 dark:bg-amber-900/30">
              <span className="text-xs text-amber-700 dark:text-amber-300">
                Change {checkedIds.size} test(s) → <span className="font-semibold">{bulkTargetType}</span>?
              </span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setBulkTargetType(null)}
                  className="rounded px-2 py-0.5 text-[10px] font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleBulkChangeType(bulkTargetType)}
                  className="rounded bg-amber-500 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-amber-600"
                >
                  Confirm
                </button>
              </div>
            </div>
          )}

          {/* Test list */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loadConfirmed !== true ? (
              <div className="flex h-full items-center justify-center p-4 text-center text-sm text-slate-400">
                <div className="space-y-2">
                  <p>Load tests to see the list.</p>
                  <Button size="sm" variant="outline" onClick={() => setLoadConfirmed(false)}>
                    Load Tests
                  </Button>
                </div>
              </div>
            ) : filtered.length === 0 ? (
              <p className="p-4 text-center text-sm text-slate-400">No tests found.</p>
            ) : (
              filtered.map((test) => {
                const typeName = (test.test_type?.name ?? "Manual") as TestTypeName;
                const isChecked = checkedIds.has(test.issue_id);
                return (
                  <div
                    key={test.issue_id}
                    className={cn(
                      "flex items-start gap-2 border-b border-slate-100 px-3 py-2 last:border-b-0 dark:border-slate-700",
                      selectedTestKey === test.jira.key
                        ? "bg-slate-100 dark:bg-slate-700"
                        : "hover:bg-slate-50 dark:hover:bg-slate-800",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleChecked(test.issue_id)}
                      disabled={isBulkChanging}
                      className="mt-1 h-3.5 w-3.5 shrink-0 rounded border-slate-300 accent-slate-700"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTestKey(test.jira.key);
                        setSelectedTestIssueId(test.issue_id);
                        setTypeMenuOpen(false);
                      }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-start justify-between gap-1">
                        <p className="min-w-0 truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                          {test.jira.summary}
                        </p>
                        <span
                          className={cn(
                            "shrink-0 rounded-full border px-1.5 py-0 text-[9px] font-semibold",
                            TYPE_COLORS[typeName],
                          )}
                        >
                          {typeName}
                        </span>
                      </div>
                      <p className="font-mono text-xs text-slate-400">{test.jira.key}</p>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── Right panel: Step editor ──────────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col rounded-lg border border-slate-200 dark:border-slate-700">
          {!selectedTestKey ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              ← Select a test to edit its steps or change its type.
            </div>
          ) : detailLoading ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              Loading…
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
                <div className="flex min-w-0 items-center gap-2">
                  <p className="min-w-0 truncate text-sm font-semibold text-slate-800 dark:text-slate-200">
                    {selectedTestKey} — {draftSteps.length} step{draftSteps.length !== 1 ? "s" : ""}
                  </p>
                  {/* Test type badge + dropdown */}
                  <div className="relative">
                    <button
                      type="button"
                      disabled={isSavingType || isSaving}
                      onClick={() => setTypeMenuOpen((o) => !o)}
                      title="Change test type"
                      className={cn(
                        "flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors",
                        TYPE_COLORS[selectedTestType],
                        "hover:brightness-95",
                      )}
                    >
                      {isSavingType ? "Saving…" : selectedTestType}
                      <ChevronDown className="h-2.5 w-2.5 opacity-60" />
                    </button>
                    {typeMenuOpen && (
                      <div className="absolute left-0 top-full z-20 mt-1 w-32 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                        {TEST_TYPES.filter((t) => t !== selectedTestType).map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => void handleChangeType(t)}
                            className="w-full px-3 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700"
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
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
                      editStatus={stepEditStatus(step)}
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
