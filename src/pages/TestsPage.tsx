import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import {
  useGetTests,
  useGetTestSets,
  useGetTestSetTests,
  useAddTestsToTestSet,
  useRemoveTestsFromTestSet,
  useTestSetMembership,
  useCreateTestSet,
  useProjectComponents,
  useRenameIssue,
  queryKeys,
} from "@/services/queries";
import type { TestSetInfo } from "@/services/queries";
import { useContentProjectKey } from "@/hooks/useProjectKey";
import { useDragAndDrop } from "@/hooks/useDragAndDrop";
import type { DragState } from "@/hooks/useDragAndDrop";
import { Toast, showToast } from "@/components/ui/toast";
import type { ToastMessage } from "@/components/ui/toast";
import { EmptyState } from "@/components/common/EmptyState";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FlaskConical,
  Layers,
  Search,
  CheckSquare2,
  Square,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  GripVertical,
  Pencil,
  Plus,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "@/components/ui/utils";
import type { XrayTest, XrayTestSet } from "@/types";

// ── Drag ghost ────────────────────────────────────────────────────────────────

function DragGhost({ drag }: { drag: DragState }) {
  return (
    <div
      className="pointer-events-none fixed z-50 flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-700 px-3 py-2 text-xs font-medium text-white shadow-lg"
      style={{ left: drag.x + 12, top: drag.y - 14 }}
    >
      <GripVertical className="h-3 w-3 opacity-60" />
      {drag.ids.length} test{drag.ids.length !== 1 ? "s" : ""}
    </div>
  );
}

// ── Test row ──────────────────────────────────────────────────────────────────

interface TestRowProps {
  test: XrayTest;
  selected: boolean;
  memberOf: TestSetInfo[];
  onToggle: () => void;
  onMouseDown: (e: React.MouseEvent) => void;
}

function TestRow({ test, selected, memberOf, onToggle, onMouseDown }: TestRowProps) {
  return (
    <div
      onMouseDown={onMouseDown}
      onClick={onToggle}
      className={cn(
        "flex cursor-pointer select-none items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors",
        selected
          ? "border-slate-700 bg-slate-700 text-white"
          : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50",
      )}
    >
      {/* Checkbox */}
      <span className="mt-0.5 shrink-0">
        {selected ? (
          <CheckSquare2 className="h-4 w-4 text-white" />
        ) : (
          <Square className="h-4 w-4 text-slate-300" />
        )}
      </span>

      {/* Summary + key */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{test.jira.summary}</p>
        <p
          className={cn("mt-0.5 font-mono text-xs", selected ? "text-slate-300" : "text-slate-400")}
        >
          {test.jira.key}
        </p>

        {/* Membership badges */}
        {memberOf.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {memberOf.map((ts) => (
              <span
                key={ts.issueId}
                title={ts.summary}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                  selected
                    ? "border-white/30 bg-white/10 text-white/80"
                    : "border-slate-200 bg-slate-100 text-slate-500",
                )}
              >
                <Layers className="h-2.5 w-2.5 shrink-0" />
                {ts.key}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Drag handle hint */}
      <GripVertical
        className={cn("mt-0.5 h-4 w-4 shrink-0", selected ? "text-white/40" : "text-slate-300")}
      />
    </div>
  );
}

// ── Left panel: all tests ─────────────────────────────────────────────────────

interface TestsPanelProps {
  projectKey: string;
  selectedIds: Set<string>;
  membership: Map<string, TestSetInfo[]>;
  onToggle: (id: string) => void;
  onSelectAll: (ids: string[]) => void;
  onClearAll: () => void;
  onBeginDrag: (ids: string[], e: React.MouseEvent) => void;
  onRegisterReload: (fn: () => Promise<unknown>) => void;
}

function TestsPanel({
  projectKey,
  selectedIds,
  membership,
  onToggle,
  onSelectAll,
  onClearAll,
  onBeginDrag,
  onRegisterReload,
}: TestsPanelProps) {
  const { data: tests, isLoading, isError, error, refetch } = useGetTests(projectKey);
  onRegisterReload(refetch);
  const [search, setSearch] = useState("");

  const q = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      (tests ?? []).filter(
        (t) =>
          !q || t.jira.key.toLowerCase().includes(q) || t.jira.summary.toLowerCase().includes(q),
      ),
    [tests, q],
  );

  const filteredIds = filtered.map((t) => t.issue_id);
  const allFilteredSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));

  /** We track mousedown start position so we only begin a drag after 5px of movement. */
  const mouseDownRef = useRef<{
    testId: string;
    startX: number;
    startY: number;
  } | null>(null);

  function handleMouseDown(e: React.MouseEvent, test: XrayTest) {
    // Only left button.
    if (e.button !== 0) return;
    mouseDownRef.current = { testId: test.issue_id, startX: e.pageX, startY: e.pageY };
  }

  // We attach a global mousemove/mouseup listener in the page-level component,
  // but we need to signal when a drag should start. We do this via the onBeginDrag callback.
  // The parent will watch for mouse movement and call us back via the drag state.
  // Actually, let's handle the threshold here with a window listener attached on mouseDown.

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      const md = mouseDownRef.current;
      if (!md) return;
      const dx = e.pageX - md.startX;
      const dy = e.pageY - md.startY;
      if (Math.abs(dx) + Math.abs(dy) > 5) {
        // Threshold exceeded — start the drag.
        const ids = selectedIds.has(md.testId) ? [...selectedIds] : [md.testId];
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
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded border border-slate-100 px-3 py-2"
          >
            <Skeleton className="h-4 w-4 shrink-0 rounded" />
            <Skeleton className="h-4 w-20 shrink-0" />
            <Skeleton className="h-4 flex-1" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
        <p className="font-medium">Failed to load tests</p>
        <pre className="mt-1 whitespace-pre-wrap font-mono text-xs">{String(error)}</pre>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <Input
          className="pl-8"
          placeholder="Filter tests…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Select-all / clear */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          {filtered.length} test{filtered.length !== 1 ? "s" : ""}
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

      {/* List */}
      <div className="flex-1 space-y-1.5 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-sm italic text-slate-400">
            {q ? "No tests match the filter." : `No tests found in ${projectKey}.`}
          </p>
        ) : (
          filtered.map((test) => (
            <TestRow
              key={test.issue_id}
              test={test}
              selected={selectedIds.has(test.issue_id)}
              memberOf={membership.get(test.issue_id) ?? []}
              onToggle={() => onToggle(test.issue_id)}
              onMouseDown={(e) => handleMouseDown(e, test)}
            />
          ))
        )}
      </div>

      {selectedIds.size > 0 && (
        <p className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-center text-xs text-slate-400">
          Drag selected tests onto a test set →
        </p>
      )}
    </div>
  );
}

// ── Test set drop target ──────────────────────────────────────────────────────

interface TestSetDropTargetProps {
  testSet: XrayTestSet;
  isExpanded: boolean;
  isDragging: boolean;
  /** Ref for detecting mouseup-on-target. Set by parent via callback ref. */
  dropRef: (el: HTMLElement | null) => void;
  isHoveredTarget: boolean;
  onToggleExpand: () => void;
  pendingSetId: string | null;
  projectKey: string;
  onToast: (msg: string, variant: "success" | "error") => void;
}

function TestSetDropTarget({
  testSet,
  isExpanded,
  isDragging,
  dropRef,
  isHoveredTarget,
  onToggleExpand,
  pendingSetId,
  projectKey,
  onToast,
}: TestSetDropTargetProps) {
  const { data: members, isLoading: membersLoading } = useGetTestSetTests(
    isExpanded ? testSet.issue_id : null,
  );
  const removeTests = useRemoveTestsFromTestSet();
  const renameIssue = useRenameIssue();
  const [memberSearch, setMemberSearch] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");

  const isPending = pendingSetId === testSet.issue_id;

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    return (members ?? []).filter(
      (t) => !q || t.jira.key.toLowerCase().includes(q) || t.jira.summary.toLowerCase().includes(q),
    );
  }, [members, memberSearch]);

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
        <button className="flex items-center gap-3 text-left" onClick={onToggleExpand}>
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
          )}
          <Layers className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="w-28 shrink-0 font-mono text-xs text-slate-500">{testSet.jira.key}</span>
        </button>

        {/* Summary — inline editable */}
        {isRenaming ? (
          <form
            className="flex flex-1 items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              const trimmed = renameDraft.trim();
              if (!trimmed || trimmed === testSet.jira.summary) {
                setIsRenaming(false);
                return;
              }
              renameIssue.mutate(
                {
                  issueKey: testSet.jira.key,
                  summary: trimmed,
                  queryKey: queryKeys.testSets(projectKey),
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
              setRenameDraft(testSet.jira.summary);
            }}
          >
            <span className="truncate">{testSet.jira.summary}</span>
            <Pencil className="h-3.5 w-3.5 shrink-0 text-slate-300 opacity-0 group-hover:opacity-100" />
          </span>
        )}

        {isPending && <Spinner size="sm" />}
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

      {/* Expanded member list */}
      {isExpanded && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3">
          {membersLoading ? (
            <div className="flex items-center gap-2 py-2 text-sm text-slate-400">
              <Spinner size="sm" />
              Loading tests…
            </div>
          ) : (
            <>
              <div className="mb-2 flex items-center gap-3">
                <span className="text-xs text-slate-400">
                  {filteredMembers.length}
                  {filteredMembers.length !== (members?.length ?? 0) &&
                    ` of ${members?.length ?? 0}`}{" "}
                  test{(members?.length ?? 0) !== 1 ? "s" : ""}
                </span>
                <Input
                  className="h-7 max-w-xs text-xs"
                  placeholder="Filter…"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                />
              </div>
              {filteredMembers.length === 0 ? (
                <p className="py-2 text-xs italic text-slate-400">
                  {memberSearch.trim()
                    ? "No tests match the filter."
                    : "This test set contains no tests yet. Drag tests here to add them."}
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
                      {filteredMembers.map((t) => (
                        <tr key={t.issue_id} className="group hover:bg-slate-50">
                          <td className="px-3 py-2 font-mono text-xs text-slate-500">
                            {t.jira.key}
                          </td>
                          <td className="px-3 py-2 text-slate-700">{t.jira.summary}</td>
                          <td className="px-3 py-2 text-right">
                            <button
                              title="Remove from test set"
                              disabled={removeTests.isPending}
                              onClick={() =>
                                removeTests.mutate(
                                  {
                                    testSetIssueId: testSet.issue_id,
                                    testIssueIds: [t.issue_id],
                                    projectKey,
                                  },
                                  {
                                    onSuccess: () =>
                                      onToast(`Removed ${t.jira.key} from test set.`, "success"),
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

// ── Right panel: test sets ────────────────────────────────────────────────────

interface TestSetsPanelProps {
  projectKey: string;
  isDragging: boolean;
  hoveredSetId: string | null;
  dropTargetRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  pendingSetId: string | null;
  onRegisterReload: (fn: () => Promise<unknown>) => void;
  onToast: (msg: string, variant: "success" | "error") => void;
}

function TestSetsPanel({
  projectKey,
  isDragging,
  hoveredSetId,
  dropTargetRefs,
  pendingSetId,
  onRegisterReload,
  onToast,
}: TestSetsPanelProps) {
  const { data: testSets, isLoading, isError, error, refetch } = useGetTestSets(projectKey);
  onRegisterReload(refetch);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const q = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      (testSets ?? []).filter(
        (ts) =>
          !q || ts.jira.key.toLowerCase().includes(q) || ts.jira.summary.toLowerCase().includes(q),
      ),
    [testSets, q],
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
            <Skeleton className="h-5 w-12 rounded-full" />
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
      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <Input
          className="pl-8"
          placeholder="Filter test sets…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <p className="text-xs text-slate-500">
        {filtered.length} set{filtered.length !== 1 ? "s" : ""}
        {isDragging && <span className="ml-2 text-slate-400">— drop onto a set to add</span>}
      </p>

      {/* Drop target list */}
      <div className="flex-1 space-y-2 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-sm italic text-slate-400">
            {q ? "No test sets match the filter." : `No test sets found in ${projectKey}.`}
          </p>
        ) : (
          filtered.map((ts) => (
            <TestSetDropTarget
              key={ts.issue_id}
              testSet={ts}
              isExpanded={expandedId === ts.issue_id}
              isDragging={isDragging}
              isHoveredTarget={hoveredSetId === ts.issue_id}
              dropRef={(el) => {
                if (el) dropTargetRefs.current.set(ts.issue_id, el);
                else dropTargetRefs.current.delete(ts.issue_id);
              }}
              onToggleExpand={() =>
                setExpandedId((prev) => (prev === ts.issue_id ? null : ts.issue_id))
              }
              pendingSetId={pendingSetId}
              projectKey={projectKey}
              onToast={onToast}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Create Test Set Dialog ────────────────────────────────────────────────────

interface CreateTestSetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectKey: string;
}

function CreateTestSetDialog({ open, onOpenChange, projectKey }: CreateTestSetDialogProps) {
  const createTestSet = useCreateTestSet();
  const { data: components, isLoading: componentsLoading } = useProjectComponents(
    open ? projectKey : null,
  );
  const [summary, setSummary] = useState("");
  const [component, setComponent] = useState("");
  const [componentSearch, setComponentSearch] = useState("");

  const filteredComponents = (components ?? []).filter((c) => {
    const q = componentSearch.trim().toLowerCase();
    return !q || c.name.toLowerCase().includes(q);
  });

  const reset = () => {
    setSummary("");
    setComponent("");
    setComponentSearch("");
    createTestSet.reset();
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!summary.trim()) return;
    createTestSet.mutate(
      { projectKey, summary: summary.trim(), ...(component ? { component } : {}) },
      {
        onSuccess: () => {
          onOpenChange(false);
          reset();
        },
      },
    );
  };

  const isSubmitting = createTestSet.isPending;

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <Dialog.Title className="text-lg font-semibold">New Test Set</Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          {/* Body */}
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 px-6 py-5">
              {/* Project badge */}
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Layers className="h-4 w-4 text-slate-400" />
                <span>
                  Creating in project{" "}
                  <span className="font-medium text-slate-700">{projectKey}</span>
                </span>
              </div>

              {/* Summary */}
              <div className="space-y-1.5">
                <Label htmlFor="ts-summary">Summary *</Label>
                <Input
                  id="ts-summary"
                  placeholder="e.g. Regression – Login flows"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  disabled={isSubmitting}
                  autoFocus
                  required
                />
              </div>

              {/* Component */}
              <div className="space-y-1.5">
                <Label>
                  Component <span className="font-normal text-slate-400">(optional)</span>
                </Label>

                <div className="space-y-2">
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

                  {/* Filterable panel */}
                  <div className="rounded-lg border border-slate-200 bg-white">
                    {/* Search bar */}
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

                    {/* List */}
                    <div className="max-h-40 overflow-y-auto">
                      {componentsLoading ? (
                        <div className="flex items-center justify-center py-6">
                          <Spinner size="sm" />
                        </div>
                      ) : filteredComponents.length === 0 ? (
                        <p className="py-6 text-center text-xs text-slate-400">
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
                              className="h-4 w-4 border-slate-300 text-slate-900 accent-slate-800"
                            />
                            <Tag className="h-3 w-3 shrink-0 text-slate-400" />
                            <span className="truncate text-slate-700">{c.name}</span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Error */}
              {createTestSet.isError && (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {String(createTestSet.error)}
                </p>
              )}
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
                  "Create Test Set"
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

export function TestsPage() {
  const projectKey = useContentProjectKey();
  const addTestsToTestSet = useAddTestsToTestSet();
  const { membership } = useTestSetMembership(projectKey);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingSetId, setPendingSetId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [createSetOpen, setCreateSetOpen] = useState(false);

  const testsRefetchRef = useRef<(() => Promise<unknown>) | null>(null);
  const testSetsRefetchRef = useRef<(() => Promise<unknown>) | null>(null);

  /** Map from test-set issueId → its DOM element for hit-testing. */
  const dropTargetRefs = useRef<Map<string, HTMLElement>>(new Map());

  const handleDropTests = useCallback(
    (testIssueIds: string[], testSetIssueId: string) => {
      if (!projectKey) return;
      setPendingSetId(testSetIssueId);
      addTestsToTestSet.mutate(
        { testSetIssueId, testIssueIds, projectKey },
        {
          onSuccess: () => {
            setPendingSetId(null);
            setSelectedIds((prev) => {
              const next = new Set(prev);
              for (const id of testIssueIds) next.delete(id);
              return next;
            });
            showToast(
              setToast,
              `Added ${testIssueIds.length} test${testIssueIds.length !== 1 ? "s" : ""} to set.`,
              "success",
            );
          },
          onError: (err) => {
            setPendingSetId(null);
            showToast(setToast, `Failed to add tests: ${String(err)}`, "error");
          },
        },
      );
    },
    [projectKey, addTestsToTestSet],
  );

  const {
    drag,
    hoveredTargetId: hoveredSetId,
    startDrag,
  } = useDragAndDrop(dropTargetRefs, handleDropTests);

  const handleReload = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([testsRefetchRef.current?.(), testSetsRefetchRef.current?.()]);
    setIsRefreshing(false);
  }, []);

  if (!projectKey) {
    return (
      <EmptyState icon={FlaskConical} message="Set a Project Key in Settings to view tests." />
    );
  }

  function handleToggle(id: string) {
    // Don't toggle if we just finished a drag.
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
          <FlaskConical className="h-5 w-5 text-slate-400" />
          <h1 className="text-xl font-semibold">
            Tests
            <span className="ml-2 text-sm font-normal text-slate-500">{projectKey}</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setCreateSetOpen(true)}>
            <Plus className="h-4 w-4" />
            New Test Set
          </Button>
          <button
            onClick={() => void handleReload()}
            disabled={isRefreshing}
            title="Reload tests and test sets"
            className="rounded p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
          >
            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="flex h-[calc(100vh-10rem)] gap-6">
        {/* Left: all tests */}
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            All Tests
          </p>
          <div className="flex-1 overflow-hidden">
            <TestsPanel
              projectKey={projectKey}
              selectedIds={selectedIds}
              membership={membership}
              onToggle={handleToggle}
              onSelectAll={handleSelectAll}
              onClearAll={handleClearAll}
              onBeginDrag={startDrag}
              onRegisterReload={(fn) => {
                testsRefetchRef.current = fn;
              }}
            />
          </div>
        </div>

        {/* Divider */}
        <div className="w-px shrink-0 bg-slate-200" />

        {/* Right: test sets */}
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Test Sets
          </p>
          <div className="flex-1 overflow-hidden">
            <TestSetsPanel
              projectKey={projectKey}
              isDragging={drag !== null}
              hoveredSetId={hoveredSetId}
              dropTargetRefs={dropTargetRefs}
              pendingSetId={pendingSetId}
              onRegisterReload={(fn) => {
                testSetsRefetchRef.current = fn;
              }}
              onToast={(msg, variant) => showToast(setToast, msg, variant)}
            />
          </div>
        </div>
      </div>

      {/* Floating drag ghost */}
      {drag && <DragGhost drag={drag} />}

      <Toast message={toast} />

      {projectKey && (
        <CreateTestSetDialog
          open={createSetOpen}
          onOpenChange={setCreateSetOpen}
          projectKey={projectKey}
        />
      )}
    </>
  );
}
