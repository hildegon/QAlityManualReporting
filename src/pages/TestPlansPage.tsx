import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  useTestPlans,
  useGetTestPlanTests,
  useGetTestSets,
  useCreateTestPlan,
  useAddTestsToTestPlan,
  useRemoveTestsFromTestPlan,
  useProjectComponents,
  useProjectVersions,
  useRenameIssue,
  queryKeys,
} from "@/services/queries";
import { useContentProjectKey } from "@/hooks/useProjectKey";
import { useDragAndDrop } from "@/hooks/useDragAndDrop";
import type { DragState } from "@/hooks/useDragAndDrop";
import { Toast, showToast } from "@/components/ui/toast";
import type { ToastMessage } from "@/components/ui/toast";
import { EmptyState } from "@/components/common/EmptyState";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge, statusVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BookOpen,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Layers,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/components/ui/utils";
import * as Dialog from "@radix-ui/react-dialog";
import { useQueryClient } from "@tanstack/react-query";
import type { TestPlan, XrayTest, XrayTestSet } from "@/types";
import * as api from "@/services/tauri";

// ── Drag ghost ────────────────────────────────────────────────────────────────

function DragGhost({ drag }: { drag: DragState }) {
  return (
    <div
      className="pointer-events-none fixed z-50 flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-700 px-3 py-2 text-xs font-medium text-white shadow-lg"
      style={{ left: drag.x + 12, top: drag.y - 14 }}
    >
      <GripVertical className="h-3 w-3 opacity-60" />
      {drag.ids.length} set{drag.ids.length !== 1 ? "s" : ""}
    </div>
  );
}

// ── Test set row (drag source) ────────────────────────────────────────────────

interface TestSetRowProps {
  testSet: XrayTestSet;
  selected: boolean;
  onToggle: () => void;
  onMouseDown: (e: React.MouseEvent) => void;
}

function TestSetRow({ testSet, selected, onToggle, onMouseDown }: TestSetRowProps) {
  return (
    <div
      onMouseDown={onMouseDown}
      onClick={onToggle}
      className={cn(
        "flex cursor-pointer select-none items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-colors",
        selected
          ? "border-slate-700 bg-slate-700 text-white"
          : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50",
      )}
    >
      <Layers className={cn("h-4 w-4 shrink-0", selected ? "text-white/60" : "text-slate-400")} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{testSet.jira.summary}</p>
        <p
          className={cn("mt-0.5 font-mono text-xs", selected ? "text-slate-300" : "text-slate-400")}
        >
          {testSet.jira.key}
        </p>
      </div>
      <GripVertical
        className={cn("h-4 w-4 shrink-0", selected ? "text-white/40" : "text-slate-300")}
      />
    </div>
  );
}

// ── Left panel: all test sets ─────────────────────────────────────────────────

interface TestSetsPanelProps {
  projectKey: string;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: (ids: string[]) => void;
  onClearAll: () => void;
  onBeginDrag: (ids: string[], e: React.MouseEvent) => void;
  onRegisterReload: (fn: () => Promise<unknown>) => void;
}

function TestSetsSourcePanel({
  projectKey,
  selectedIds,
  onToggle,
  onSelectAll,
  onClearAll,
  onBeginDrag,
  onRegisterReload,
}: TestSetsPanelProps) {
  const { data: testSets, isLoading, isError, error, refetch } = useGetTestSets(projectKey);
  onRegisterReload(refetch);

  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      (testSets ?? []).filter(
        (ts) =>
          !q || ts.jira.key.toLowerCase().includes(q) || ts.jira.summary.toLowerCase().includes(q),
      ),
    [testSets, q],
  );

  const filteredIds = filtered.map((ts) => ts.issue_id);
  const allFilteredSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));

  const mouseDownRef = useRef<{
    testSetId: string;
    startX: number;
    startY: number;
  } | null>(null);

  function handleMouseDown(e: React.MouseEvent, testSet: XrayTestSet) {
    if (e.button !== 0) return;
    mouseDownRef.current = { testSetId: testSet.issue_id, startX: e.pageX, startY: e.pageY };
  }

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      const md = mouseDownRef.current;
      if (!md) return;
      const dx = e.pageX - md.startX;
      const dy = e.pageY - md.startY;
      if (Math.abs(dx) + Math.abs(dy) > 5) {
        const ids = selectedIds.has(md.testSetId) ? [...selectedIds] : [md.testSetId];
        onBeginDrag(ids, e as unknown as React.MouseEvent);
        mouseDownRef.current = null;
      }
    }
    function handleMouseUp() {
      mouseDownRef.current = null;
    }
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [selectedIds, onBeginDrag]);

  if (isLoading) {
    return (
      <div className="flex h-full flex-col gap-3">
        <Skeleton className="h-8 w-full" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded border border-slate-100 px-3 py-2"
          >
            <Skeleton className="h-4 w-4 shrink-0 rounded" />
            <Skeleton className="h-4 flex-1" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
        <p className="font-medium">Failed to load test sets</p>
        <pre className="mt-1 whitespace-pre-wrap font-mono text-xs">{String(error)}</pre>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <Input
          className="pl-8"
          placeholder="Filter test sets…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          {filtered.length} set{filtered.length !== 1 ? "s" : ""}
          {selectedIds.size > 0 && (
            <span className="ml-1.5 rounded-full bg-slate-700 px-1.5 py-0.5 text-white">
              {selectedIds.size} selected
            </span>
          )}
        </span>
        {allFilteredSelected ? (
          <button className="hover:text-slate-700" onClick={onClearAll}>
            Deselect all
          </button>
        ) : (
          <button className="hover:text-slate-700" onClick={() => onSelectAll(filteredIds)}>
            Select all
          </button>
        )}
      </div>

      <div className="flex-1 space-y-1.5 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-sm italic text-slate-400">
            {q ? "No test sets match the filter." : `No test sets found in ${projectKey}.`}
          </p>
        ) : (
          filtered.map((ts) => (
            <TestSetRow
              key={ts.issue_id}
              testSet={ts}
              selected={selectedIds.has(ts.issue_id)}
              onToggle={() => onToggle(ts.issue_id)}
              onMouseDown={(e) => handleMouseDown(e, ts)}
            />
          ))
        )}
      </div>

      {selectedIds.size > 0 && (
        <p className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-center text-xs text-slate-400">
          Drag selected sets onto a test plan →
        </p>
      )}
    </div>
  );
}

// ── Test plan drop target ─────────────────────────────────────────────────────

interface TestPlanDropTargetProps {
  testPlan: TestPlan;
  isExpanded: boolean;
  isDragging: boolean;
  isHoveredTarget: boolean;
  dropRef: (el: HTMLElement | null) => void;
  pendingPlanId: string | null;
  onToggleExpand: () => void;
  projectKey: string;
  onToast: (msg: string, variant: "success" | "error") => void;
}

function TestPlanDropTarget({
  testPlan,
  isExpanded,
  isDragging,
  isHoveredTarget,
  dropRef,
  pendingPlanId,
  onToggleExpand,
  projectKey,
  onToast,
}: TestPlanDropTargetProps) {
  const { data: tests, isLoading: testsLoading } = useGetTestPlanTests(
    isExpanded ? testPlan.issue_id : null,
  );
  const removeTests = useRemoveTestsFromTestPlan();
  const renameIssue = useRenameIssue();
  const [memberSearch, setMemberSearch] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const isPending = pendingPlanId === testPlan.issue_id;

  const filteredTests = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    return (tests ?? []).filter(
      (t) => !q || t.jira.key.toLowerCase().includes(q) || t.jira.summary.toLowerCase().includes(q),
    );
  }, [tests, memberSearch]);

  return (
    <div
      ref={dropRef}
      className={cn(
        "overflow-hidden rounded-lg border transition-all duration-150",
        isHoveredTarget
          ? "border-slate-700 bg-slate-50 ring-2 ring-slate-700"
          : isDragging
            ? "border-slate-300 bg-white ring-1 ring-slate-200"
            : "border-slate-200 bg-white",
      )}
    >
      {/* Header */}
      <div className="flex w-full items-center gap-3 px-4 py-3 hover:bg-slate-50">
        <button className="flex flex-1 items-center gap-3 text-left" onClick={onToggleExpand}>
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
          )}
          <BookOpen className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="w-28 shrink-0 font-mono text-xs text-slate-500">
            {testPlan.jira.key}
          </span>
        </button>

        {/* Summary — inline editable */}
        {isRenaming ? (
          <form
            className="flex flex-1 items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              const trimmed = renameDraft.trim();
              if (!trimmed || trimmed === testPlan.jira.summary) {
                setIsRenaming(false);
                return;
              }
              renameIssue.mutate(
                {
                  issueKey: testPlan.jira.key,
                  summary: trimmed,
                  queryKey: queryKeys.testPlans(projectKey),
                },
                { onSettled: () => setIsRenaming(false) },
              );
            }}
          >
            <input
              autoFocus
              className="flex-1 rounded border border-slate-300 px-2 py-0.5 text-sm focus:border-slate-500 focus:outline-none"
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setIsRenaming(false);
              }}
              disabled={renameIssue.isPending}
            />
            <button
              type="submit"
              className="rounded px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
              disabled={renameIssue.isPending}
            >
              {renameIssue.isPending ? "…" : "Save"}
            </button>
            <button
              type="button"
              className="rounded px-2 py-0.5 text-xs text-slate-400 hover:bg-slate-100"
              onClick={() => setIsRenaming(false)}
            >
              Cancel
            </button>
          </form>
        ) : (
          <span
            className="group flex flex-1 cursor-pointer items-center gap-1.5 truncate text-sm text-slate-800"
            onClick={() => {
              setIsRenaming(true);
              setRenameDraft(testPlan.jira.summary);
            }}
          >
            <span className="truncate">{testPlan.jira.summary}</span>
            <Pencil className="h-3.5 w-3.5 shrink-0 text-slate-300 opacity-0 group-hover:opacity-100" />
          </span>
        )}

        {isPending && <Spinner size="sm" />}
        {testPlan.jira.status && (
          <Badge variant={statusVariant(testPlan.jira.status.name)} className="shrink-0">
            {testPlan.jira.status.name}
          </Badge>
        )}
        {isHoveredTarget && (
          <span className="shrink-0 rounded-full bg-slate-700 px-2 py-0.5 text-xs font-medium text-white">
            Drop to add
          </span>
        )}
        {isDragging && !isHoveredTarget && (
          <span className="shrink-0 rounded-full border border-dashed border-slate-400 px-2 py-0.5 text-xs text-slate-400">
            Drop here
          </span>
        )}
      </div>

      {/* Expanded tests list */}
      {isExpanded && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3">
          {testsLoading ? (
            <div className="flex items-center gap-2 py-2 text-sm text-slate-400">
              <Spinner size="sm" />
              Loading tests…
            </div>
          ) : (
            <>
              <div className="mb-2 flex items-center gap-3">
                <span className="text-xs text-slate-400">
                  {filteredTests.length}
                  {filteredTests.length !== (tests?.length ?? 0) &&
                    ` of ${tests?.length ?? 0}`}{" "}
                  test{(tests?.length ?? 0) !== 1 ? "s" : ""}
                </span>
                <Input
                  className="h-7 max-w-xs text-xs"
                  placeholder="Filter…"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                />
              </div>
              {filteredTests.length === 0 ? (
                <p className="py-2 text-xs italic text-slate-400">
                  {memberSearch.trim()
                    ? "No tests match the filter."
                    : "This test plan contains no tests yet. Drag test sets here to add them."}
                </p>
              ) : (
                <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                      <tr>
                        <th className="px-3 py-2 text-left">Key</th>
                        <th className="px-3 py-2 text-left">Summary</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredTests.map((t: XrayTest) => (
                        <tr key={t.issue_id} className="group hover:bg-slate-50">
                          <td className="px-3 py-2 font-mono text-xs text-slate-500">
                            {t.jira.key}
                          </td>
                          <td className="px-3 py-2 text-slate-700">{t.jira.summary}</td>
                          <td className="px-3 py-2 text-right">
                            <button
                              title="Remove from test plan"
                              disabled={removeTests.isPending}
                              onClick={() =>
                                removeTests.mutate(
                                  {
                                    testPlanIssueId: testPlan.issue_id,
                                    testIssueIds: [t.issue_id],
                                    projectKey,
                                  },
                                  {
                                    onSuccess: () =>
                                      onToast(`Removed ${t.jira.key} from test plan.`, "success"),
                                    onError: (err: unknown) =>
                                      onToast(`Failed to remove test: ${String(err)}`, "error"),
                                  },
                                )
                              }
                              className="rounded p-1 text-slate-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {removeTests.isPending &&
                              removeTests.variables?.testIssueIds[0] === t.issue_id ? (
                                <Spinner size="sm" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Right panel: test plans ───────────────────────────────────────────────────

interface TestPlansPanelProps {
  projectKey: string;
  isDragging: boolean;
  hoveredPlanId: string | null;
  dropTargetRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  pendingPlanId: string | null;
  onRegisterReload: (fn: () => Promise<unknown>) => void;
  onToast: (msg: string, variant: "success" | "error") => void;
}

function TestPlansDropPanel({
  projectKey,
  isDragging,
  hoveredPlanId,
  dropTargetRefs,
  pendingPlanId,
  onRegisterReload,
  onToast,
}: TestPlansPanelProps) {
  const { data: plans, isLoading, isError, error, refetch } = useTestPlans(projectKey);
  onRegisterReload(refetch);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const q = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      (plans ?? []).filter(
        (p) =>
          !q || p.jira.key.toLowerCase().includes(q) || p.jira.summary.toLowerCase().includes(q),
      ),
    [plans, q],
  );

  if (isLoading) {
    return (
      <div className="flex h-full flex-col gap-3">
        <Skeleton className="h-8 w-full" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded border border-slate-100 px-3 py-2"
          >
            <Skeleton className="h-4 w-20 shrink-0" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
        <p className="font-medium">Failed to load test plans</p>
        <pre className="mt-1 whitespace-pre-wrap font-mono text-xs">{String(error)}</pre>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <Input
          className="pl-8"
          placeholder="Filter test plans…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <p className="text-xs text-slate-500">
        {filtered.length} plan{filtered.length !== 1 ? "s" : ""}
        {isDragging && <span className="ml-2 text-slate-400">— drop a set to add its tests</span>}
      </p>

      <div className="flex-1 space-y-2 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-sm italic text-slate-400">
            {q ? "No test plans match the filter." : `No test plans found in ${projectKey}.`}
          </p>
        ) : (
          filtered.map((plan) => (
            <TestPlanDropTarget
              key={plan.issue_id}
              testPlan={plan}
              isExpanded={expandedId === plan.issue_id}
              isDragging={isDragging}
              isHoveredTarget={hoveredPlanId === plan.issue_id}
              dropRef={(el) => {
                if (el) dropTargetRefs.current.set(plan.issue_id, el);
                else dropTargetRefs.current.delete(plan.issue_id);
              }}
              onToggleExpand={() =>
                setExpandedId((prev) => (prev === plan.issue_id ? null : plan.issue_id))
              }
              pendingPlanId={pendingPlanId}
              projectKey={projectKey}
              onToast={onToast}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Create plan dialog ────────────────────────────────────────────────────────

interface CreatePlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectKey: string;
}

function CreatePlanDialog({ open, onOpenChange, projectKey }: CreatePlanDialogProps) {
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
        <Dialog.Content className="fixed left-1/2 top-1/2 flex max-h-[90vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl bg-white shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <Dialog.Title className="text-lg font-semibold">New Test Plan</Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
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
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <BookOpen className="h-4 w-4 text-slate-400" />
                  <span>
                    Creating in project{" "}
                    <span className="font-medium text-slate-700">{projectKey}</span>
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
                    <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-100 py-0.5 pl-2.5 pr-1.5 text-xs font-medium text-slate-700">
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
                              component === c.name ? "bg-slate-50" : "hover:bg-slate-50",
                              isSubmitting && "cursor-not-allowed opacity-60",
                            )}
                          >
                            <input
                              type="radio"
                              checked={component === c.name}
                              onChange={() =>
                                setComponent((prev) => (prev === c.name ? "" : c.name))
                              }
                              disabled={isSubmitting}
                              className="h-4 w-4 border-slate-300 accent-slate-800"
                            />
                            <Tag className="h-3 w-3 shrink-0 text-slate-400" />
                            <span className="truncate text-slate-700">{c.name}</span>
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
                    <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-100 py-0.5 pl-2.5 pr-1.5 text-xs font-medium text-slate-700">
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

                  <div className="rounded-lg border border-slate-200 bg-white">
                    <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
                      <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Filter versions…"
                        value={versionSearch}
                        onChange={(e) => setVersionSearch(e.target.value)}
                        disabled={isSubmitting}
                        className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed"
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
                              fixVersion === v.name ? "bg-slate-50" : "hover:bg-slate-50",
                              isSubmitting && "cursor-not-allowed opacity-60",
                            )}
                          >
                            <input
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
                              <span className="truncate text-slate-700">{v.name}</span>
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
                  <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {String(createPlan.error)}
                  </p>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-6 py-4">
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

// ── Page ──────────────────────────────────────────────────────────────────────

export function TestPlansPage() {
  const projectKey = useContentProjectKey();
  const addTestsToTestPlan = useAddTestsToTestPlan();
  const queryClient = useQueryClient();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const testSetsRefetchRef = useRef<(() => Promise<unknown>) | null>(null);
  const plansRefetchRef = useRef<(() => Promise<unknown>) | null>(null);

  /** Map from plan issueId → its DOM element for drop hit-testing. */
  const dropTargetRefs = useRef<Map<string, HTMLElement>>(new Map());

  const handleReload = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([testSetsRefetchRef.current?.(), plansRefetchRef.current?.()]);
    setIsRefreshing(false);
  }, []);

  /**
   * Called when one or more test sets are dropped onto a test plan.
   * Fetches the tests inside each set then calls addTestsToTestPlan.
   * Note: useDragAndDrop calls onDrop(ids, targetId) — here ids = testSetIssueIds.
   */
  const handleDropSets = useCallback(
    async (testSetIssueIds: string[], testPlanIssueId: string) => {
      if (!projectKey) return;
      setPendingPlanId(testPlanIssueId);
      try {
        // Resolve tests for all dropped sets in parallel.
        const pages = await Promise.all(
          testSetIssueIds.map((setId) =>
            queryClient.fetchQuery<XrayTest[]>({
              queryKey: queryKeys.testSetTests(setId),
              queryFn: () => api.getTestSetTests(setId),
              staleTime: 5 * 60 * 1_000,
            }),
          ),
        );
        const testIssueIds = [...new Set(pages.flat().map((t) => t.issue_id))];

        if (testIssueIds.length === 0) {
          showToast(setToast, "The selected test set(s) contain no tests.", "error");
          setPendingPlanId(null);
          return;
        }

        addTestsToTestPlan.mutate(
          { testPlanIssueId, testIssueIds, projectKey },
          {
            onSuccess: () => {
              setPendingPlanId(null);
              setSelectedIds((prev) => {
                const next = new Set(prev);
                for (const id of testSetIssueIds) next.delete(id);
                return next;
              });
              showToast(
                setToast,
                `Added ${testIssueIds.length} test${testIssueIds.length !== 1 ? "s" : ""} to plan.`,
                "success",
              );
            },
            onError: (err) => {
              setPendingPlanId(null);
              showToast(setToast, `Failed to add tests: ${String(err)}`, "error");
            },
          },
        );
      } catch (err) {
        setPendingPlanId(null);
        showToast(setToast, `Failed to fetch tests from set: ${String(err)}`, "error");
      }
    },
    [projectKey, queryClient, addTestsToTestPlan],
  );

  const {
    drag,
    hoveredTargetId: hoveredPlanId,
    startDrag,
  } = useDragAndDrop(dropTargetRefs, handleDropSets);

  if (!projectKey) {
    return (
      <EmptyState icon={BookOpen} message="Set a Project Key in Settings to view test plans." />
    );
  }

  function handleToggle(id: string) {
    if (drag) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSelectAll(ids: string[]) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
  }

  function handleClearAll() {
    setSelectedIds(new Set());
  }

  return (
    <>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-slate-400" />
          <h1 className="text-xl font-semibold">
            Test Plans
            <span className="ml-2 text-sm font-normal text-slate-500">{projectKey}</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void handleReload()}
            disabled={isRefreshing}
            title="Reload test sets and plans"
            className="rounded p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
          >
            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
          </button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            New plan
          </Button>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="flex h-[calc(100vh-10rem)] gap-6">
        {/* Left: test sets (drag sources) */}
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Test Sets
          </p>
          <div className="flex-1 overflow-hidden">
            <TestSetsSourcePanel
              projectKey={projectKey}
              selectedIds={selectedIds}
              onToggle={handleToggle}
              onSelectAll={handleSelectAll}
              onClearAll={handleClearAll}
              onBeginDrag={startDrag}
              onRegisterReload={(fn) => {
                testSetsRefetchRef.current = fn;
              }}
            />
          </div>
        </div>

        {/* Divider */}
        <div className="w-px shrink-0 bg-slate-200" />

        {/* Right: test plans (drop targets) */}
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Test Plans
          </p>
          <div className="flex-1 overflow-hidden">
            <TestPlansDropPanel
              projectKey={projectKey}
              isDragging={drag !== null}
              hoveredPlanId={hoveredPlanId}
              dropTargetRefs={dropTargetRefs}
              pendingPlanId={pendingPlanId}
              onRegisterReload={(fn) => {
                plansRefetchRef.current = fn;
              }}
              onToast={(msg, variant) => showToast(setToast, msg, variant)}
            />
          </div>
        </div>
      </div>

      {/* Floating drag ghost */}
      {drag && <DragGhost drag={drag} />}

      <Toast message={toast} />

      <CreatePlanDialog open={createOpen} onOpenChange={setCreateOpen} projectKey={projectKey} />
    </>
  );
}
