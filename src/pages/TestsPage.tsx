import { memo, useState, useMemo, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
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
  useIssueTransitions,
  useApplyTransition,
  useReloadTests,
  useIsTestsStreaming,
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
  AlertTriangle,
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
  MoreHorizontal,
  Activity,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

import { cn } from "@/components/ui/utils";
import type { JiraTransition, TestLastRunEntry, XrayTest, XrayTestSet } from "@/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

type ToastFn = (msg: string, variant: "success" | "error") => void;

const DEPRECATING_KEYWORDS = [
  "deprecated",
  "won't do",
  "wont do",
  "obsolete",
  "cancelled",
  "canceled",
  "rejected",
  "inactive",
  "withdrawn",
  "closed",
];

function isDeprecatingStatus(statusName: string): boolean {
  const lower = statusName.toLowerCase();
  return DEPRECATING_KEYWORDS.some((kw) => lower.includes(kw));
}

function loadHiddenKeys(storageKey: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveHiddenKeys(storageKey: string, keys: Set<string>) {
  try {
    localStorage.setItem(storageKey, JSON.stringify([...keys]));
  } catch { /* ignore */ }
}

function categoryColor(key?: string): string {
  if (key === "done")
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300";
  if (key === "indeterminate")
    return "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300";
  return "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300";
}

// ── Transition menu ───────────────────────────────────────────────────────────

interface TransitionMenuProps {
  issueKey: string;
  onToast: ToastFn;
  /** Called after a transition is applied successfully, with the target status name. */
  onTransitioned?: (toStatusName: string) => void;
  /** Which side the dropdown opens toward. Default: right. */
  align?: "left" | "right";
  /** Extra class on the trigger button. */
  triggerClassName?: string | undefined;
}

function TransitionMenu({
  issueKey,
  onToast,
  onTransitioned,
  align = "right",
  triggerClassName,
}: TransitionMenuProps) {
  const [open, setOpen] = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, right: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { data: transitions, isLoading } = useIssueTransitions(open ? issueKey : null);
  const apply = useApplyTransition();

  const calcPos = useCallback(() => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setDropPos({ top: r.bottom + 4, left: r.left, right: window.innerWidth - r.right });
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);


  const dropdown = open
    ? createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: "fixed",
            top: dropPos.top,
            ...(align === "right" ? { right: dropPos.right } : { left: dropPos.left }),
            zIndex: 9999,
          }}
          className="min-w-52 rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800"
        >
          <p className="border-b border-slate-100 px-3 py-2 text-xs font-medium text-slate-400 dark:border-slate-700 dark:text-slate-500">
            Transition
          </p>
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Spinner size="sm" />
            </div>
          ) : !transitions?.length ? (
            <p className="px-3 py-3 text-xs italic text-slate-400">No transitions available.</p>
          ) : (
            <div className="py-1">
              {transitions.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  disabled={apply.isPending}
                  onClick={(e) => {
                    e.stopPropagation();
                    apply.mutate(
                      { issueKey, transitionId: t.id },
                      {
                        onSuccess: () => {
                          onToast(`${issueKey} → "${t.to.name}"`, "success");
                          onTransitioned?.(t.to.name);
                          setOpen(false);
                        },
                        onError: (err) => {
                          onToast(`Transition failed: ${String(err)}`, "error");
                        },
                      },
                    );
                  }}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <span>{t.name}</span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                      categoryColor(t.to.category?.key),
                    )}
                  >
                    {t.to.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>,
        document.body,
      )
    : null;

  return (
    <div className="shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          calcPos();
          setOpen((p) => !p);
        }}
        aria-label="Actions"
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded transition-colors",
          open
            ? "bg-slate-200 text-slate-700 dark:bg-slate-600 dark:text-slate-200"
            : "text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-600 dark:hover:text-slate-300",
          triggerClassName,
        )}
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>
      {dropdown}
    </div>
  );
}

// ── Drag ghost ────────────────────────────────────────────────────────────────

function DragGhost({
  drag,
  ghostRef,
}: {
  drag: DragState;
  ghostRef: (el: HTMLElement | null) => void;
}) {
  return (
    <div
      ref={ghostRef}
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
  onToast: ToastFn;
  onHide: (issueKey: string) => void;
}

const TestRow = memo(function TestRow({
  test,
  selected,
  memberOf,
  onToggle,
  onMouseDown,
  onToast,
  onHide,
}: TestRowProps) {
  return (
    <div
      onMouseDown={onMouseDown}
      onClick={onToggle}
      className={cn(
        "group flex cursor-pointer select-none items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors",
        selected
          ? "border-slate-700 bg-slate-700 text-white"
          : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:bg-slate-700",
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
                    : "border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-400",
                )}
              >
                <Layers className="h-2.5 w-2.5 shrink-0" />
                {ts.key}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Right side: actions menu + drag handle */}
      <div className="mt-0.5 flex shrink-0 items-center gap-1">
        <div className="opacity-0 transition-opacity group-hover:opacity-100">
          <TransitionMenu
            issueKey={test.jira.key}
            onToast={onToast}
            onTransitioned={(name) => { if (isDeprecatingStatus(name)) onHide(test.jira.key); }}
            align="right"
            triggerClassName={
              selected
                ? "text-white/60 hover:bg-white/10 dark:hover:bg-white/10"
                : undefined
            }
          />
        </div>
        <GripVertical
          className={cn("h-4 w-4", selected ? "text-white/40" : "text-slate-300")}
        />
      </div>
    </div>
  );
});

// ── Left panel: all tests ─────────────────────────────────────────────────────

interface TestsPanelProps {
  projectKey: string;
  selectedIds: Set<string>;
  membership: Map<string, TestSetInfo[]>;
  enabled: boolean;
  onToggle: (id: string) => void;
  onSelectAll: (ids: string[]) => void;
  onClearAll: () => void;
  onBeginDrag: (ids: string[], e: React.MouseEvent) => void;
  onToast: ToastFn;
  hiddenKeys: Set<string>;
  showHidden: boolean;
  onToggleShowHidden: () => void;
  onHide: (issueKey: string) => void;
}

function TestsPanel({
  projectKey,
  selectedIds,
  membership,
  enabled,
  onToggle,
  onSelectAll,
  onClearAll,
  onBeginDrag,
  onToast,
  hiddenKeys,
  showHidden,
  onToggleShowHidden,
  onHide,
}: TestsPanelProps) {
  const { data: tests, isLoading, isError, error } = useGetTests(projectKey, enabled);

  const [search, setSearch] = useState("");

  const q = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      (tests ?? []).filter(
        (t) =>
          (showHidden || !hiddenKeys.has(t.jira.key)) &&
          (!q || t.jira.key.toLowerCase().includes(q) || t.jira.summary.toLowerCase().includes(q)),
      ),
    [tests, q, hiddenKeys, showHidden],
  );
  const hiddenCount = useMemo(
    () => (tests ?? []).filter((t) => hiddenKeys.has(t.jira.key)).length,
    [tests, hiddenKeys],
  );

  const filteredIds = useMemo(() => filtered.map((t) => t.issue_id), [filtered]);
  const allFilteredSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));

  // ── Virtualized test list ──────────────────────────────────────────────────
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 15,
    getItemKey: (index) => filtered[index]?.issue_id ?? index,
  });

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

  if (!enabled && !tests) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-slate-400">
        <FlaskConical className="h-8 w-8 text-slate-300" />
        <p>Confirm loading to fetch tests.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full flex-col gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Spinner size="sm" />
          <span>Loading tests from Xray…</span>
        </div>
        <Skeleton className="h-8 w-full" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded border border-slate-100 px-3 py-2 dark:border-slate-700"
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
      <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
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
        <span className="flex items-center gap-1.5 flex-wrap">
          {filtered.length} test{filtered.length !== 1 ? "s" : ""}
          {selectedIds.size > 0 && (
            <span className="rounded-full bg-slate-700 px-1.5 py-0.5 text-white">
              {selectedIds.size} selected
            </span>
          )}
          {hiddenCount > 0 && (
            <button
              onClick={onToggleShowHidden}
              className="rounded-full border border-dashed border-slate-300 px-1.5 py-0.5 text-slate-400 hover:border-slate-400 hover:text-slate-600 dark:border-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
            >
              {showHidden ? "hide" : `${hiddenCount} deprecated`}
            </button>
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

      {/* List (virtualised) */}
      <div ref={parentRef} className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-sm italic text-slate-400">
            {q ? "No tests match the filter." : `No tests found in ${projectKey}.`}
          </p>
        ) : (
          <div
            style={{
              height: virtualizer.getTotalSize(),
              width: "100%",
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const test = filtered[virtualRow.index];
              if (!test) return null;
              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <div className="pb-1.5">
                    <TestRow
                      test={test}
                      selected={selectedIds.has(test.issue_id)}
                      memberOf={membership.get(test.issue_id) ?? []}
                      onToggle={() => onToggle(test.issue_id)}
                      onMouseDown={(e) => handleMouseDown(e, test)}
                      onToast={onToast}
                      onHide={onHide}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedIds.size > 0 && (
        <p className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-center text-xs text-slate-400 dark:border-slate-500 dark:text-slate-400">
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
  /** Stable callback — called with (setId, el) to register/unregister the drop target DOM node. */
  onRegisterDrop: (setId: string, el: HTMLElement | null) => void;
  isHoveredTarget: boolean;
  /** Stable callback — called with setId to toggle the expanded state. */
  onToggleExpand: (setId: string) => void;
  pendingSetId: string | null;
  projectKey: string;
  onToast: (msg: string, variant: "success" | "error") => void;
  onHide: (issueKey: string) => void;
}

const TestSetDropTarget = memo(function TestSetDropTarget({
  testSet,
  isExpanded,
  isDragging,
  onRegisterDrop,
  isHoveredTarget,
  onToggleExpand,
  onHide,
  pendingSetId,
  projectKey,
  onToast,
}: TestSetDropTargetProps) {
  const setId = testSet.issue_id;
  const dropRef = useCallback(
    (el: HTMLElement | null) => onRegisterDrop(setId, el),
    [onRegisterDrop, setId],
  );
  const handleToggleExpand = useCallback(() => onToggleExpand(setId), [onToggleExpand, setId]);
  // Only fetch tests when the card is expanded.
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
          ? "border-slate-700 bg-slate-50 ring-2 ring-slate-700 dark:border-slate-400 dark:bg-slate-700 dark:ring-slate-400"
          : isDragging
            ? "border-slate-300 bg-white ring-1 ring-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:ring-slate-600"
            : "border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-800",
      )}
    >
      {/* Header */}
      <div className="flex w-full items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700">
        <button className="flex items-center gap-3 text-left" onClick={handleToggleExpand}>
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
          )}
          <Layers className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="w-28 shrink-0 font-mono text-xs text-slate-500 dark:text-slate-400">
            {testSet.jira.key}
          </span>
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
              className="flex-1 rounded border border-slate-300 px-2 py-0.5 text-sm focus:border-slate-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setIsRenaming(false);
              }}
              disabled={renameIssue.isPending}
            />
            <button
              type="submit"
              className="rounded px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-600"
              disabled={renameIssue.isPending}
            >
              {renameIssue.isPending ? "…" : "Save"}
            </button>
            <button
              type="button"
              className="rounded px-2 py-0.5 text-xs text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600"
              onClick={() => setIsRenaming(false)}
            >
              Cancel
            </button>
          </form>
        ) : (
          <span
            className="group flex flex-1 cursor-pointer items-center gap-1.5 truncate text-sm text-slate-800 dark:text-slate-200"
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
          <span className="shrink-0 rounded-full border border-dashed border-slate-400 px-2 py-0.5 text-xs text-slate-400 dark:border-slate-500 dark:text-slate-400">
            Drop here
          </span>
        )}

        {!isRenaming && (
          <TransitionMenu
            issueKey={testSet.jira.key}
            onToast={onToast}
            onTransitioned={(name) => { if (isDeprecatingStatus(name)) onHide(testSet.jira.key); }}
            align="right"
          />
        )}
      </div>

      {/* Expanded member list */}
      {isExpanded && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3 dark:border-slate-700 dark:bg-slate-700/40">
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
                <div className="overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-800">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400 dark:bg-slate-700 dark:text-slate-400">
                      <tr>
                        <th className="px-3 py-2 text-left">Key</th>
                        <th className="px-3 py-2 text-left">Summary</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {filteredMembers.map((t) => (
                        <tr
                          key={t.issue_id}
                          className="group hover:bg-slate-50 dark:hover:bg-slate-700"
                        >
                          <td className="px-3 py-2 font-mono text-xs text-slate-500 dark:text-slate-500">
                            {t.jira.key}
                          </td>
                          <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                            {t.jira.summary}
                          </td>
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
                              className="rounded p-1 text-slate-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-red-900/40 dark:hover:text-red-400"
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
});

// ── Right panel: test sets ────────────────────────────────────────────────────

interface TestSetsPanelProps {
  projectKey: string;
  isDragging: boolean;
  hoveredSetId: string | null;
  dropTargetRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  pendingSetId: string | null;
  onRegisterReload: (fn: () => Promise<unknown>) => void;
  onToast: (msg: string, variant: "success" | "error") => void;
  hiddenKeys: Set<string>;
  showHidden: boolean;
  onToggleShowHidden: () => void;
  onHide: (issueKey: string) => void;
}

function TestSetsPanel({
  projectKey,
  isDragging,
  hoveredSetId,
  dropTargetRefs,
  pendingSetId,
  onRegisterReload,
  onToast,
  hiddenKeys,
  showHidden,
  onToggleShowHidden,
  onHide,
}: TestSetsPanelProps) {
  const { data: testSets, isLoading, isError, error, refetch } = useGetTestSets(projectKey);

  useEffect(() => {
    onRegisterReload(refetch);
  }, [onRegisterReload, refetch]);

  const [search, setSearch] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const q = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      (testSets ?? []).filter(
        (ts) =>
          (showHidden || !hiddenKeys.has(ts.jira.key)) &&
          (!q || ts.jira.key.toLowerCase().includes(q) || ts.jira.summary.toLowerCase().includes(q)),
      ),
    [testSets, q, hiddenKeys, showHidden],
  );
  const hiddenCount = useMemo(
    () => (testSets ?? []).filter((ts) => hiddenKeys.has(ts.jira.key)).length,
    [testSets, hiddenKeys],
  );

  const filteredIds = useMemo(() => filtered.map((ts) => ts.issue_id), [filtered]);
  const allExpanded = filteredIds.length > 0 && filteredIds.every((id) => expandedIds.has(id));

  const handleExpandAll = useCallback(() => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      for (const id of filteredIds) next.add(id);
      return next;
    });
  }, [filteredIds]);

  const handleCollapseAll = useCallback(() => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      for (const id of filteredIds) next.delete(id);
      return next;
    });
  }, [filteredIds]);

  const handleRegisterDrop = useCallback(
    (setId: string, el: HTMLElement | null) => {
      if (el) dropTargetRefs.current.set(setId, el);
      else dropTargetRefs.current.delete(setId);
    },
    [dropTargetRefs],
  );

  const handleToggleExpand = useCallback((setId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(setId)) next.delete(setId);
      else next.add(setId);
      return next;
    });
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-full flex-col gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Spinner size="sm" />
          <span>Loading test sets from Xray…</span>
        </div>
        <Skeleton className="h-8 w-full" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded border border-slate-100 px-3 py-2 dark:border-slate-700"
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
      <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
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

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span className="flex items-center gap-1.5 flex-wrap">
          {filtered.length} set{filtered.length !== 1 ? "s" : ""}
          {isDragging && <span className="text-slate-400">— drop onto a set to add</span>}
          {hiddenCount > 0 && (
            <button
              onClick={onToggleShowHidden}
              className="rounded-full border border-dashed border-slate-300 px-1.5 py-0.5 text-slate-400 hover:border-slate-400 hover:text-slate-600 dark:border-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
            >
              {showHidden ? "hide" : `${hiddenCount} deprecated`}
            </button>
          )}
        </span>
        {filtered.length > 0 && (
          <button
            className="hover:text-slate-700 dark:hover:text-slate-200"
            onClick={allExpanded ? handleCollapseAll : handleExpandAll}
          >
            {allExpanded ? "Collapse all" : "Expand all"}
          </button>
        )}
      </div>

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
              isExpanded={expandedIds.has(ts.issue_id)}
              isDragging={isDragging}
              isHoveredTarget={hoveredSetId === ts.issue_id}
              onRegisterDrop={handleRegisterDrop}
              onToggleExpand={handleToggleExpand}
              pendingSetId={pendingSetId}
              projectKey={projectKey}
              onToast={onToast}
              onHide={onHide}
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

  const filteredComponents = useMemo(() => {
    const q = componentSearch.trim().toLowerCase();
    return (components ?? []).filter((c) => !q || c.name.toLowerCase().includes(q));
  }, [components, componentSearch]);

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
        <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white shadow-xl dark:bg-slate-800">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
            <Dialog.Title className="text-lg font-semibold dark:text-slate-100">
              New Test Set
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

          {/* Body */}
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 px-6 py-5">
              {/* Project badge */}
              <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <Layers className="h-4 w-4 text-slate-400" />
                <span>
                  Creating in project{" "}
                  <span className="font-medium text-slate-700 dark:text-slate-200">
                    {projectKey}
                  </span>
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

                  {/* Filterable panel */}
                  <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                    {/* Search bar */}
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
                              component === c.name
                                ? "bg-slate-50 dark:bg-slate-700"
                                : "hover:bg-slate-50 dark:hover:bg-slate-700",
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
                            <span className="truncate text-slate-700 dark:text-slate-200">
                              {c.name}
                            </span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Error */}
              {createTestSet.isError && (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
                  {String(createTestSet.error)}
                </p>
              )}
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

// ── Test Health Panel ─────────────────────────────────────────────────────────

/** Format an ISO-8601 date string to a short human-readable form. */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** How long ago a date was, as a short string. */
function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

interface TestHealthPanelProps {
  projectKey: string;
  enabled: boolean;
  onRequestLoad: () => void;
  loadConfirmed: boolean | null;
  onToast: ToastFn;
  onReload: () => Promise<void>;
  isReloading: boolean;
  /** Increment this to force health data to re-fetch after a tests reload. */
  resetKey: number;
}

function TestHealthPanel({
  projectKey,
  enabled,
  onRequestLoad,
  loadConfirmed,
  onToast,
  onReload,
  isReloading,
  resetKey,
}: TestHealthPanelProps) {
  const { data: tests, isLoading: testsLoading } = useGetTests(projectKey, enabled);
  const isStreaming = useIsTestsStreaming(projectKey);

  // ── Health data (last run per test, streamed from Rust) ──────────────────────
  const [healthMap, setHealthMap] = useState<Map<string, TestLastRunEntry>>(new Map());
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthProgress, setHealthProgress] = useState({ processed: 0, total: 0 });
  const healthListenerRef = useRef<(() => void) | null>(null);
  const healthStartedRef = useRef<string | null>(null);
  /** Accumulates fresh entries during a fetch so we can persist them when done. */
  const healthAccRef = useRef<Map<string, TestLastRunEntry>>(new Map());

  // ── Bulk selection ────────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkApplying, setBulkApplying] = useState(false);
  const headerCheckRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!enabled || !tests?.length || isStreaming) return;
    const stateKey = `${projectKey}:${resetKey}`;
    if (healthStartedRef.current === stateKey) return;

    healthStartedRef.current = stateKey;
    healthAccRef.current = new Map();
    setHealthLoading(true);
    setHealthProgress({ processed: 0, total: 0 });

    const start = async () => {
      // Load persisted cache so user sees stale data immediately while fresh fetch runs.
      try {
        const cached = await invoke<TestLastRunEntry[]>("load_health_cache", { projectKey });
        if (cached.length > 0) {
          setHealthMap(new Map(cached.map((e) => [e.test_issue_id, e])));
        } else {
          setHealthMap(new Map());
        }
      } catch {
        setHealthMap(new Map());
      }

      console.log("[health] starting listener, tests count:", tests.length);

      const unlistenError = await listen<string>("tests:health:error", (event) => {
        console.error("[health] error from backend:", event.payload);
        onToast(`Health check failed: ${event.payload}`, "error");
        setHealthLoading(false);
        unlistenError();
      });

      const unlisten = await listen<{ entries: TestLastRunEntry[]; done: boolean; total: number; processed: number }>(
        "tests:health:batch",
        (event) => {
          const { entries, done, total, processed } = event.payload;
          console.log(`[health] batch received: ${entries.length} entries, ${processed}/${total}, done=${done}`);
          if (entries.length > 0) {
            for (const e of entries) healthAccRef.current.set(e.test_issue_id, e);
            setHealthMap(new Map(healthAccRef.current));
          }
          setHealthProgress({ processed, total });
          if (done) {
            console.log("[health] all batches received");
            setHealthLoading(false);
            healthListenerRef.current?.();
            healthListenerRef.current = null;
            unlistenError();
            // Persist fresh data so next session loads immediately.
            void invoke("save_health_cache", {
              projectKey,
              entries: [...healthAccRef.current.values()],
            });
          }
        },
      );
      healthListenerRef.current = unlisten;

      try {
        console.log("[health] invoking get_tests_health_data");
        await invoke<void>("get_tests_health_data", {
          testIssueIds: tests.map((t) => t.issue_id),
        });
        console.log("[health] invoke returned ok");
      } catch (e) {
        console.error("[health] invoke error:", e);
        setHealthLoading(false);
        unlistenError();
      }
    };

    void start();
    // No cleanup — listener persists across re-renders so in-flight data still arrives.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, projectKey, resetKey, !!tests?.length, isStreaming]);

  const [search, setSearch] = useState("");
  const parentRef = useRef<HTMLDivElement>(null);

  const sorted = useMemo<XrayTest[]>(() => {
    if (!tests) return [];
    const lower = search.toLowerCase();
    const active = tests.filter(
      (t) => !t.jira.status?.name || !isDeprecatingStatus(t.jira.status.name),
    );
    const filtered = lower
      ? active.filter(
          (t) =>
            t.jira.key.toLowerCase().includes(lower) ||
            t.jira.summary.toLowerCase().includes(lower),
        )
      : active;
    return [...filtered].sort((a, b) => {
      const aDate = healthMap.get(a.issue_id)?.finished_on ?? null;
      const bDate = healthMap.get(b.issue_id)?.finished_on ?? null;
      // Never-executed tests first
      if (!aDate && bDate) return -1;
      if (aDate && !bDate) return 1;
      if (!aDate && !bDate) return a.jira.key.localeCompare(b.jira.key);
      // Both have dates — oldest first (stalest at top)
      if (aDate! < bDate!) return -1;
      if (aDate! > bDate!) return 1;
      return a.jira.key.localeCompare(b.jira.key);
    });
  }, [tests, healthMap, search]);

  const neverExecuted = useMemo(
    () =>
      healthLoading || testsLoading
        ? null
        : (tests ?? [])
            .filter((t) => !t.jira.status?.name || !isDeprecatingStatus(t.jira.status.name))
            .filter((t) => !healthMap.get(t.issue_id)?.finished_on).length,
    [tests, healthMap, healthLoading, testsLoading],
  );

  // ── Bulk selection helpers ────────────────────────────────────────────────────
  const firstSelectedKey = useMemo<string | null>(() => {
    if (selectedIds.size === 0) return null;
    const firstId = selectedIds.values().next().value as string;
    return sorted.find((t) => t.issue_id === firstId)?.jira.key ?? null;
  }, [selectedIds, sorted]);

  const { data: bulkTransitions, isLoading: bulkTransitionsLoading } =
    useIssueTransitions(firstSelectedKey);

  const applyBulkTransition = useCallback(
    async (transition: JiraTransition) => {
      setBulkApplying(true);
      const targets = sorted.filter((t) => selectedIds.has(t.issue_id));
      let success = 0;
      let failed = 0;
      for (const test of targets) {
        try {
          await invoke("transition_issue", { issueKey: test.jira.key, transitionId: transition.id });
          success++;
        } catch {
          failed++;
        }
      }
      setBulkApplying(false);
      setSelectedIds(new Set());
      onToast(
        failed > 0
          ? `"${transition.to.name}" applied to ${success}/${targets.length} tests (${failed} failed)`
          : `"${transition.to.name}" applied to ${success} tests`,
        failed > 0 ? "error" : "success",
      );
    },
    [selectedIds, sorted, onToast],
  );

  // Keep header checkbox indeterminate state in sync (React can't set this as a prop).
  useEffect(() => {
    if (headerCheckRef.current) {
      headerCheckRef.current.indeterminate =
        selectedIds.size > 0 && selectedIds.size < sorted.length;
    }
  }, [selectedIds.size, sorted.length]);

  const ROW_HEIGHT = 41;
  const virtualizer = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
    getItemKey: (index) => sorted[index]?.issue_id ?? index,
  });

  // Not yet consented — show prompt
  if (loadConfirmed === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <Activity className="h-10 w-10 text-slate-300" />
        <div className="space-y-1">
          <p className="font-medium text-slate-700 dark:text-slate-300">No test data loaded</p>
          <p className="text-sm text-slate-500">
            Load all tests to see their execution history and health.
          </p>
        </div>
        <Button size="sm" onClick={onRequestLoad}>
          Load Tests
        </Button>
      </div>
    );
  }

  if (testsLoading || loadConfirmed !== true) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  if (!tests || tests.length === 0) {
    return <EmptyState icon={Activity} message="No tests found for this project." />;
  }

  return (
    <div className="flex h-full flex-col">
      {/* Search + stats */}
      <div className="mb-3 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by key or name…"
            className="h-8 pl-8 text-sm"
          />
        </div>
        <div className="flex shrink-0 items-center gap-3 text-xs text-slate-500">
          <span>
            {sorted.length}
            {isStreaming || isReloading ? ` / ${tests.length}…` : " tests"}
          </span>
          {(isStreaming || isReloading || testsLoading) ? (
            <span className="flex items-center gap-1 text-slate-400">
              <RefreshCw className="h-3 w-3 animate-spin" />
              {isReloading ? "Reloading…" : "Fetching tests…"}
            </span>
          ) : healthLoading ? (
            <span className="flex items-center gap-1 text-slate-400">
              <RefreshCw className="h-3 w-3 animate-spin" />
              {healthProgress.total > 0
                ? `${healthProgress.processed} / ${healthProgress.total} checked…`
                : "Checking runs…"}
            </span>
          ) : neverExecuted !== null && neverExecuted > 0 ? (
            <span className="font-medium text-amber-600 dark:text-amber-400">
              {neverExecuted} never executed
            </span>
          ) : null}
          <button
            onClick={() => void onReload()}
            disabled={isReloading || testsLoading || isStreaming}
            title="Reload tests"
            className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40 dark:hover:bg-slate-700"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isReloading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Bulk action bar — visible when tests are selected */}
      {selectedIds.size > 0 && (
        <div className="mb-2 flex items-center gap-2 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 dark:border-slate-600">
          <span className="shrink-0 text-sm font-medium text-slate-200">
            {selectedIds.size} selected
          </span>
          <div className="mx-1 h-4 w-px bg-slate-600" />
          {bulkTransitionsLoading || bulkApplying ? (
            <Spinner size="sm" />
          ) : (
            bulkTransitions?.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={bulkApplying}
                onClick={() => void applyBulkTransition(t)}
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-40",
                  categoryColor(t.to.category?.key),
                )}
              >
                {t.to.name}
              </button>
            ))
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="text-slate-400 hover:text-slate-200"
            title="Clear selection"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Virtualized list */}
      <div className="flex-1 overflow-hidden rounded-md border border-slate-200 dark:border-slate-700">
        {/* Sticky header */}
        <div className="grid grid-cols-[2.5rem_2rem_7rem_1fr_9rem_7rem_2.5rem] border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center py-2 pl-3">
            <input
              ref={headerCheckRef}
              type="checkbox"
              checked={selectedIds.size === sorted.length && sorted.length > 0}
              onChange={(e) =>
                setSelectedIds(e.target.checked ? new Set(sorted.map((t) => t.issue_id)) : new Set())
              }
              className="h-3.5 w-3.5 cursor-pointer accent-teal-500"
            />
          </div>
          <div className="py-2 pl-1" />
          <div className="py-2 pl-2 pr-3">Key</div>
          <div className="py-2 pr-3">Summary</div>
          <div className="py-2 pr-3">Last Execution</div>
          <div className="py-2 pr-3">Result</div>
          <div className="py-2 pr-2" />
        </div>

        {sorted.length === 0 ? (
          <div className="flex items-center justify-center p-6 text-sm text-slate-400">
            No tests match your filter.
          </div>
        ) : (
          <div ref={parentRef} className="overflow-y-auto" style={{ height: "calc(100% - 33px)" }}>
            <div style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}>
              {virtualizer.getVirtualItems().map((vRow) => {
                const test = sorted[vRow.index];
                if (!test) return null;
                const lastRun = healthMap.get(test.issue_id);
                const isSelected = selectedIds.has(test.issue_id);
                return (
                  <div
                    key={vRow.key}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: `${ROW_HEIGHT}px`,
                      transform: `translateY(${vRow.start}px)`,
                    }}
                    className={cn(
                      "group grid grid-cols-[2.5rem_2rem_7rem_1fr_9rem_7rem_2.5rem] items-center border-b border-slate-100 dark:border-slate-800",
                      isSelected
                        ? "bg-teal-50 dark:bg-teal-900/20"
                        : "hover:bg-slate-50 dark:hover:bg-slate-800/50",
                    )}
                  >
                    {/* Checkbox */}
                    <div className="flex items-center py-2 pl-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(test.issue_id);
                            else next.delete(test.issue_id);
                            return next;
                          });
                        }}
                        className="h-3.5 w-3.5 cursor-pointer accent-teal-500 opacity-0 transition-opacity group-hover:opacity-100"
                        style={isSelected ? { opacity: 1 } : undefined}
                      />
                    </div>
                    {/* Status dot */}
                    <div className="py-2 pl-1">
                      <span
                        className="block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: lastRun?.status?.color ?? "#94a3b8" }}
                      />
                    </div>
                    {/* Key */}
                    <div className="py-2 pl-2 pr-3">
                      <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                        {test.jira.key}
                      </span>
                    </div>
                    {/* Summary */}
                    <div className="min-w-0 py-2 pr-3">
                      <span
                        className="block truncate text-sm text-slate-800 dark:text-slate-200"
                        title={test.jira.summary}
                      >
                        {test.jira.summary}
                      </span>
                    </div>
                    {/* Last execution date */}
                    <div className="py-2 pr-3">
                      {lastRun?.finished_on ? (
                        <span
                          className="text-xs text-slate-600 dark:text-slate-400"
                          title={formatDate(lastRun.finished_on)}
                        >
                          {timeAgo(lastRun.finished_on)}
                        </span>
                      ) : (
                        <span className="text-xs italic text-amber-600 dark:text-amber-400">
                          Never executed
                        </span>
                      )}
                    </div>
                    {/* Last result status badge */}
                    <div className="py-2 pr-3">
                      {lastRun?.status ? (
                        <span
                          className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium"
                          style={{
                            color: lastRun.status.color ?? "#64748b",
                            backgroundColor: `${lastRun.status.color ?? "#94a3b8"}20`,
                          }}
                        >
                          {lastRun.status.name}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </div>
                    {/* Transition menu */}
                    <div className="py-2 pr-2">
                      <TransitionMenu
                        issueKey={test.jira.key}
                        onToast={onToast}
                        align="right"
                        triggerClassName="opacity-0 group-hover:opacity-100"
                        onTransitioned={(statusName) => {
                          onToast(`${test.jira.key} moved to "${statusName}"`, "success");
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function TestsPage() {
  const projectKey = useContentProjectKey();
  const queryClient = useQueryClient();
  const addTestsToTestSet = useAddTestsToTestSet();
  const { membership } = useTestSetMembership(projectKey);

  /* Check whether we already have cached test data for this project.
     If so, skip the warning dialog — data is already in memory. */
  const hasCachedTests = !!queryClient.getQueryData(queryKeys.tests(projectKey ?? ""));

  // true = user confirmed loading | null = user dismissed/cancelled (page shown, tests not loaded) | false = dialog not yet answered
  const [loadConfirmed, setLoadConfirmed] = useState<boolean | null>(hasCachedTests ? true : false);
  const [activeTab, setActiveTab] = useState<"tests" | "health">("tests");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingSetId, setPendingSetId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [isRefreshingTests, setIsRefreshingTests] = useState(false);
  const [isRefreshingTestSets, setIsRefreshingTestSets] = useState(false);
  const [createSetOpen, setCreateSetOpen] = useState(false);

  // Hidden (deprecated) issue keys — persisted to localStorage per project
  const storageKeyTests = `qality_hidden_tests_${projectKey ?? ""}`;
  const storageKeySets = `qality_hidden_sets_${projectKey ?? ""}`;
  const [hiddenTestKeys, setHiddenTestKeys] = useState<Set<string>>(() =>
    loadHiddenKeys(storageKeyTests),
  );
  const [hiddenSetKeys, setHiddenSetKeys] = useState<Set<string>>(() =>
    loadHiddenKeys(storageKeySets),
  );
  const [showHiddenTests, setShowHiddenTests] = useState(false);
  const [showHiddenSets, setShowHiddenSets] = useState(false);

  const reloadTests = useReloadTests(projectKey ?? undefined);
  const testSetsRefetchRef = useRef<(() => Promise<unknown>) | null>(null);

  const handleRegisterTestSetsReload = useCallback((fn: () => Promise<unknown>) => {
    testSetsRefetchRef.current = fn;
  }, []);
  const handleToast = useCallback(
    (msg: string, variant: "success" | "error") => showToast(setToast, msg, variant),
    [],
  );

  const handleHideTest = useCallback(
    (issueKey: string) => {
      setHiddenTestKeys((prev) => {
        const next = new Set(prev);
        next.add(issueKey);
        saveHiddenKeys(storageKeyTests, next);
        return next;
      });
    },
    [storageKeyTests],
  );

  const handleHideSet = useCallback(
    (issueKey: string) => {
      setHiddenSetKeys((prev) => {
        const next = new Set(prev);
        next.add(issueKey);
        saveHiddenKeys(storageKeySets, next);
        return next;
      });
    },
    [storageKeySets],
  );

  const handleToggleShowHiddenTests = useCallback(() => setShowHiddenTests((p) => !p), []);
  const handleToggleShowHiddenSets = useCallback(() => setShowHiddenSets((p) => !p), []);

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
    ghostRef,
    hoveredTargetId: hoveredSetId,
    startDrag,
  } = useDragAndDrop(dropTargetRefs, handleDropTests);

  const [healthResetKey, setHealthResetKey] = useState(0);

  const handleReloadTests = useCallback(async () => {
    setIsRefreshingTests(true);
    await reloadTests();
    setHealthResetKey((k) => k + 1);
    setIsRefreshingTests(false);
  }, [reloadTests]);

  const handleReloadTestSets = useCallback(async () => {
    setIsRefreshingTestSets(true);
    await testSetsRefetchRef.current?.();
    setIsRefreshingTestSets(false);
  }, []);

  const handleToggle = useCallback(
    (id: string) => {
      // Don't toggle if we just finished a drag.
      if (drag) return;
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [drag],
  );

  const handleSelectAll = useCallback((ids: string[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
  }, []);

  const handleClearAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  if (!projectKey) {
    return (
      <EmptyState icon={FlaskConical} message="Set a Project Key in Settings to view tests." />
    );
  }

  return (
    <>
      {/* ── Warning dialog (shown once per launch when tests aren't cached) ── */}
      <Dialog.Root
        open={loadConfirmed === false}
        onOpenChange={(open) => {
          if (!open) setLoadConfirmed(null); // null = dismissed (page shown, tests not loaded)
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
                  requires fetching all pages from the Xray API. Depending on the number of tests
                  this can take a <span className="font-medium">significant amount of time</span>.
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
                  <Button size="sm" onClick={() => setLoadConfirmed(true)}>
                    Load Tests
                  </Button>
                </div>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

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
          {activeTab === "tests" && (
            <Button size="sm" onClick={() => setCreateSetOpen(true)}>
              <Plus className="h-4 w-4" />
              New Test Set
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex items-center gap-1 border-b border-slate-200 dark:border-slate-700">
        <button
          onClick={() => setActiveTab("tests")}
          className={cn(
            "flex items-center gap-1.5 border-b-2 px-3 pb-2 text-sm font-medium transition-colors",
            activeTab === "tests"
              ? "border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300",
          )}
        >
          <Layers className="h-4 w-4" />
          Tests &amp; Sets
        </button>
        <button
          onClick={() => {
            setActiveTab("health");
            if (loadConfirmed === null) setLoadConfirmed(false);
          }}
          className={cn(
            "flex items-center gap-1.5 border-b-2 px-3 pb-2 text-sm font-medium transition-colors",
            activeTab === "health"
              ? "border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300",
          )}
        >
          <Activity className="h-4 w-4" />
          Health
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "tests" ? (
        <div className="flex h-[calc(100vh-13rem)] gap-6">
          {/* Left: all tests */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                All Tests
              </p>
              <button
                onClick={() => void handleReloadTests()}
                disabled={isRefreshingTests || !loadConfirmed}
                title="Reload tests"
                className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40 dark:hover:bg-slate-700 dark:text-slate-400"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", isRefreshingTests && "animate-spin")} />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <TestsPanel
                projectKey={projectKey}
                selectedIds={selectedIds}
                membership={membership}
                enabled={loadConfirmed === true}
                onToggle={handleToggle}
                onSelectAll={handleSelectAll}
                onClearAll={handleClearAll}
                onBeginDrag={startDrag}
                onToast={handleToast}
                hiddenKeys={hiddenTestKeys}
                showHidden={showHiddenTests}
                onToggleShowHidden={handleToggleShowHiddenTests}
                onHide={handleHideTest}
              />
            </div>
          </div>

          {/* Divider */}
          <div className="w-px shrink-0 bg-slate-200 dark:bg-slate-700" />

          {/* Right: test sets */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Test Sets
              </p>
              <button
                onClick={() => void handleReloadTestSets()}
                disabled={isRefreshingTestSets}
                title="Reload test sets"
                className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40 dark:hover:bg-slate-700 dark:text-slate-400"
              >
                <RefreshCw
                  className={cn("h-3.5 w-3.5", isRefreshingTestSets && "animate-spin")}
                />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <TestSetsPanel
                projectKey={projectKey}
                isDragging={drag !== null}
                hoveredSetId={hoveredSetId}
                dropTargetRefs={dropTargetRefs}
                pendingSetId={pendingSetId}
                onRegisterReload={handleRegisterTestSetsReload}
                onToast={handleToast}
                hiddenKeys={hiddenSetKeys}
                showHidden={showHiddenSets}
                onToggleShowHidden={handleToggleShowHiddenSets}
                onHide={handleHideSet}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="h-[calc(100vh-13rem)]">
          <TestHealthPanel
            projectKey={projectKey}
            enabled={loadConfirmed === true}
            loadConfirmed={loadConfirmed}
            onRequestLoad={() => setLoadConfirmed(false)}
            onToast={handleToast}
            onReload={handleReloadTests}
            isReloading={isRefreshingTests}
            resetKey={healthResetKey}
          />
        </div>
      )}

      {/* Floating drag ghost */}
      {drag && <DragGhost drag={drag} ghostRef={ghostRef} />}

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
