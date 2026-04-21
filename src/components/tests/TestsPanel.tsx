import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { FlaskConical, Search, Download, X } from "lucide-react";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";

import { useGetTests } from "@/services/queries";
import type { TestSetInfo } from "@/services/queries";
import type { XrayTest } from "@/types";
import * as api from "@/services/tauri";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { type ToastFn } from "./utils";
import { TestRow } from "./TestRow";

export interface TestsPanelProps {
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

export function TestsPanel({
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
  const searchRef = useRef<HTMLInputElement>(null);

  // F2: `/` focuses search input when tab is active
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  const [isExporting, setIsExporting] = useState(false);

  const handleExportJson = useCallback(async () => {
    const path = await saveDialog({
      title: "Export tests as JSON",
      defaultPath: `tests-${projectKey}-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!path) return;
    setIsExporting(true);
    try {
      const exportData = await api.getTestsExportData(filtered.map((t) => t.issue_id));
      const exportMap = new Map(exportData.map((d) => [d.issue_id, d]));

      const data = filtered.map((test) => {
        const sets = membership.get(test.issue_id) ?? [];
        const content = exportMap.get(test.issue_id);
        return {
          key: test.jira.key,
          summary: test.jira.summary,
          test_type: test.test_type?.name ?? null,
          jira_status: test.jira.status?.name ?? null,
          priority: test.jira.priority?.name ?? null,
          components: (test.jira.components ?? []).map((c) => c.name),
          labels: test.jira.labels ?? [],
          assignee: test.jira.assignee?.display_name ?? null,
          created: test.jira.created ?? null,
          test_sets: sets.map((s) => ({ key: s.key, summary: s.summary })),
          steps: (content?.steps ?? []).map((s) => ({
            action: s.action ?? null,
            data: s.data ?? null,
            expected_result: s.result ?? null,
          })),
          gherkin: content?.gherkin ?? null,
          unstructured: content?.unstructured ?? null,
        };
      });
      await api.writeTextFile(path, JSON.stringify(data, null, 2));
    } finally {
      setIsExporting(false);
    }
  }, [filtered, membership, projectKey]);

  // ── Virtualised test list ──────────────────────────────────────────────────
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 15,
    getItemKey: (index) => filtered[index]?.issue_id ?? index,
  });

  /** Track mousedown start position so we only begin a drag after 5px of movement. */
  const mouseDownRef = useRef<{
    testId: string;
    startX: number;
    startY: number;
  } | null>(null);

  function handleMouseDown(e: React.MouseEvent, test: XrayTest) {
    if (e.button !== 0) return;
    mouseDownRef.current = { testId: test.issue_id, startX: e.pageX, startY: e.pageY };
  }

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      const md = mouseDownRef.current;
      if (!md) return;
      const dx = e.pageX - md.startX;
      const dy = e.pageY - md.startY;
      if (Math.abs(dx) + Math.abs(dy) > 5) {
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
      {/* Sticky toolbar: search + select row */}
      <div className="sticky top-0 z-10 flex flex-col gap-2 bg-white/95 pb-1 backdrop-blur dark:bg-slate-900/95">
        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input
            ref={searchRef}
            className="pl-8 pr-8"
            placeholder="Filter tests…  (press /)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              title="Clear"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Select-all / clear */}
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span className="flex flex-wrap items-center gap-1.5">
            {q ? (
              <span>
                {filtered.length} of {(tests ?? []).length} test{(tests ?? []).length !== 1 ? "s" : ""}
              </span>
            ) : (
              <span>
                {filtered.length} test{filtered.length !== 1 ? "s" : ""}
              </span>
            )}
            {selectedIds.size > 0 && (
              <span className="rounded-full bg-indigo-600 px-1.5 py-0.5 font-medium text-white">
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
          <span className="flex items-center gap-2">
            {allFilteredSelected ? (
              <button className="hover:text-slate-700" onClick={onClearAll}>
                Deselect all
              </button>
            ) : (
              <button className="hover:text-slate-700" onClick={() => onSelectAll(filteredIds)}>
                Select all
              </button>
            )}
            <button
              onClick={() => void handleExportJson()}
              disabled={isExporting || filtered.length === 0}
              title="Export as JSON"
              className="rounded p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40 dark:hover:bg-slate-700"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          </span>
        </div>
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
        <p className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-center text-xs text-indigo-700 dark:border-indigo-700/50 dark:bg-indigo-900/20 dark:text-indigo-300">
          Drag selected tests onto a test set →
        </p>
      )}
    </div>
  );
}
