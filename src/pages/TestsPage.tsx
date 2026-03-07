import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import {
  useGetTests,
  useGetTestSets,
  useGetTestSetTests,
  useAddTestsToTestSet,
  useTestSetMembership,
} from "@/services/queries";
import type { TestSetInfo } from "@/services/queries";
import { useContentProjectKey } from "@/hooks/useProjectKey";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
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
} from "lucide-react";
import { cn } from "@/components/ui/utils";
import type { XrayTest, XrayTestSet } from "@/types";

// ── Custom mouse-based drag state ─────────────────────────────────────────────
// HTML5 DnD does not work reliably in Tauri's WebView (macOS WKWebView
// intercepts native drag events). We implement drag ourselves using
// mousedown → mousemove → mouseup with a floating ghost element.

interface DragState {
  /** IDs being dragged. */
  ids: string[];
  /** Current mouse position (page coordinates). */
  x: number;
  y: number;
}

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
      <div className="flex h-48 items-center justify-center">
        <Spinner />
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
  dropRef: (el: HTMLDivElement | null) => void;
  isHoveredTarget: boolean;
  onToggleExpand: () => void;
  pendingSetId: string | null;
}

function TestSetDropTarget({
  testSet,
  isExpanded,
  isDragging,
  dropRef,
  isHoveredTarget,
  onToggleExpand,
  pendingSetId,
}: TestSetDropTargetProps) {
  const { data: members, isLoading: membersLoading } = useGetTestSetTests(
    isExpanded ? testSet.issue_id : null,
  );
  const [memberSearch, setMemberSearch] = useState("");

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
      <button
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
        onClick={onToggleExpand}
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
        )}
        <Layers className="h-4 w-4 shrink-0 text-slate-400" />
        <span className="w-28 shrink-0 font-mono text-xs text-slate-500">{testSet.jira.key}</span>
        <span className="flex-1 truncate text-sm text-slate-800">{testSet.jira.summary}</span>
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
      </button>

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
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredMembers.map((t) => (
                        <tr key={t.issue_id} className="hover:bg-slate-50">
                          <td className="px-3 py-2 font-mono text-xs text-slate-500">
                            {t.jira.key}
                          </td>
                          <td className="px-3 py-2 text-slate-700">{t.jira.summary}</td>
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
  dropTargetRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  pendingSetId: string | null;
  onRegisterReload: (fn: () => Promise<unknown>) => void;
}

function TestSetsPanel({
  projectKey,
  isDragging,
  hoveredSetId,
  dropTargetRefs,
  pendingSetId,
  onRegisterReload,
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
      <div className="flex h-48 items-center justify-center">
        <Spinner />
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
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Toast notification ────────────────────────────────────────────────────────

interface ToastProps {
  message: string;
  type: "success" | "error";
  onDismiss: () => void;
}

function Toast({ message, type, onDismiss }: ToastProps) {
  return (
    <div
      className={cn(
        "fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border px-4 py-3 shadow-lg text-sm font-medium",
        type === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-red-200 bg-red-50 text-red-800",
      )}
    >
      <div className="flex items-center gap-3">
        {message}
        <button onClick={onDismiss} className="text-xs opacity-60 hover:opacity-100">
          ✕
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function TestsPage() {
  const projectKey = useContentProjectKey();
  const addTestsToTestSet = useAddTestsToTestSet();
  const { membership } = useTestSetMembership(projectKey);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<DragState | null>(null);
  const [hoveredSetId, setHoveredSetId] = useState<string | null>(null);
  const [pendingSetId, setPendingSetId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const testsRefetchRef = useRef<(() => Promise<unknown>) | null>(null);
  const testSetsRefetchRef = useRef<(() => Promise<unknown>) | null>(null);

  /** Map from test-set issueId → its DOM element for hit-testing. */
  const dropTargetRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const handleReload = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([testsRefetchRef.current?.(), testSetsRefetchRef.current?.()]);
    setIsRefreshing(false);
  }, []);

  // ── Global mouse listeners for drag ─────────────────────────────────────
  useEffect(() => {
    if (!drag) return;

    function handleMouseMove(e: MouseEvent) {
      setDrag((prev) => (prev ? { ...prev, x: e.pageX, y: e.pageY } : null));

      // Hit-test against drop target elements.
      let foundId: string | null = null;
      for (const [setId, el] of dropTargetRefs.current.entries()) {
        const rect = el.getBoundingClientRect();
        if (
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom
        ) {
          foundId = setId;
          break;
        }
      }
      setHoveredSetId(foundId);
    }

    function handleMouseUp() {
      // If we're hovering over a set, drop the tests there.
      setDrag((currentDrag) => {
        setHoveredSetId((currentHoveredId) => {
          if (currentDrag && currentHoveredId) {
            handleDropTests(currentHoveredId, currentDrag.ids);
          }
          return null;
        });
        return null;
      });
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null]);

  if (!projectKey) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-3 text-slate-400">
        <FlaskConical className="h-10 w-10 opacity-40" />
        <p className="text-sm">Set a Project Key in Settings to view tests.</p>
      </div>
    );
  }

  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3_500);
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

  function handleBeginDrag(ids: string[], e: React.MouseEvent) {
    setDrag({ ids, x: e.pageX, y: e.pageY });
  }

  function handleDropTests(testSetIssueId: string, testIssueIds: string[]) {
    setPendingSetId(testSetIssueId);
    addTestsToTestSet.mutate(
      { testSetIssueId, testIssueIds },
      {
        onSuccess: () => {
          setPendingSetId(null);
          setSelectedIds((prev) => {
            const next = new Set(prev);
            for (const id of testIssueIds) next.delete(id);
            return next;
          });
          showToast(
            `Added ${testIssueIds.length} test${testIssueIds.length !== 1 ? "s" : ""} to set.`,
            "success",
          );
        },
        onError: (err) => {
          setPendingSetId(null);
          showToast(`Failed to add tests: ${String(err)}`, "error");
        },
      },
    );
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
        <button
          onClick={() => void handleReload()}
          disabled={isRefreshing}
          title="Reload tests and test sets"
          className="rounded p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
        >
          <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
        </button>
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
              onBeginDrag={handleBeginDrag}
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
            />
          </div>
        </div>
      </div>

      {/* Floating drag ghost */}
      {drag && <DragGhost drag={drag} />}

      {toast && (
        <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
      )}
    </>
  );
}
