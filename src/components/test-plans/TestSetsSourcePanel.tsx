import { useState, useRef, useEffect, useMemo, useDeferredValue } from "react";
import { useGetTestSets } from "@/services/queries";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { Search } from "lucide-react";
import type { XrayTestSet } from "@/types";
import { TestSetSourceRow } from "./TestSetSourceRow";

export interface TestSetsPanelProps {
  projectKey: string;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: (ids: string[]) => void;
  onClearAll: () => void;
  onBeginDrag: (ids: string[], e: React.MouseEvent) => void;
  onRegisterReload: (fn: () => Promise<unknown>) => void;
}

export function TestSetsSourcePanel({
  projectKey,
  selectedIds,
  onToggle,
  onSelectAll,
  onClearAll,
  onBeginDrag,
  onRegisterReload,
}: TestSetsPanelProps) {
  const { data: testSets, isLoading, isError, error, refetch } = useGetTestSets(projectKey);

  useEffect(() => {
    onRegisterReload(refetch);
  }, [onRegisterReload, refetch]);

  const [search, setSearch] = useState("");
  const q = useDeferredValue(search).trim().toLowerCase();
  const filtered = useMemo(
    () =>
      (testSets ?? []).filter(
        (ts) =>
          !q || ts.jira.key.toLowerCase().includes(q) || ts.jira.summary.toLowerCase().includes(q),
      ),
    [testSets, q],
  );

  const filteredIds = useMemo(() => filtered.map((ts) => ts.issue_id), [filtered]);
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
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Spinner size="sm" />
          <span>Loading test sets from Xray…</span>
        </div>
        <Skeleton className="h-8 w-full" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded border border-slate-100 px-3 py-2 dark:border-slate-700"
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
      <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
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
            <TestSetSourceRow
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
        <p className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-center text-xs text-slate-400 dark:border-slate-500 dark:text-slate-400">
          Drag selected sets onto a test plan →
        </p>
      )}
    </div>
  );
}
