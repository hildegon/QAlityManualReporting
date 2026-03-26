import { useState, useMemo, useCallback, useEffect } from "react";
import { Search } from "lucide-react";

import { useGetTestSets } from "@/services/queries";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { type ToastFn } from "./utils";
import { TestSetDropTarget } from "./TestSetDropTarget";

export interface TestSetsPanelProps {
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

export function TestSetsPanel({
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
          (!q ||
            ts.jira.key.toLowerCase().includes(q) ||
            ts.jira.summary.toLowerCase().includes(q)),
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
        <span className="flex flex-wrap items-center gap-1.5">
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

export { type ToastFn };
