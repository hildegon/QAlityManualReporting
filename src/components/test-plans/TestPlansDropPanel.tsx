import { useState, useCallback, useEffect, useMemo, useDeferredValue } from "react";
import { useTestPlans } from "@/services/queries";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/components/ui/utils";
import { Search } from "lucide-react";
import { TestPlanDropTarget } from "./TestPlanDropTarget";

export interface TestPlansPanelProps {
  projectKey: string;
  isDragging: boolean;
  hoveredPlanId: string | null;
  dropTargetRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  pendingPlanId: string | null;
  onRegisterReload: (fn: () => Promise<unknown>) => void;
  onToast: (msg: string, variant: "success" | "error") => void;
}

export function TestPlansDropPanel({
  projectKey,
  isDragging,
  hoveredPlanId,
  dropTargetRefs,
  pendingPlanId,
  onRegisterReload,
  onToast,
}: TestPlansPanelProps) {
  const { data: plans, isLoading, isError, error, refetch } = useTestPlans(projectKey);

  useEffect(() => {
    onRegisterReload(refetch);
  }, [onRegisterReload, refetch]);

  const [search, setSearch] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const q = useDeferredValue(search).trim().toLowerCase();

  // Collect unique statuses from loaded plans for filter chips.
  const availableStatuses = useMemo(() => {
    const names = (plans ?? [])
      .map((p) => p.jira.status?.name)
      .filter((s): s is string => s !== undefined);
    return [...new Set(names)].sort();
  }, [plans]);

  const filtered = useMemo(
    () =>
      (plans ?? []).filter((p) => {
        const matchesSearch =
          !q || p.jira.key.toLowerCase().includes(q) || p.jira.summary.toLowerCase().includes(q);
        const matchesStatus = statusFilter === null || p.jira.status?.name === statusFilter;
        return matchesSearch && matchesStatus;
      }),
    [plans, q, statusFilter],
  );

  const filteredIds = useMemo(() => filtered.map((p) => p.issue_id), [filtered]);
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
    (planId: string, el: HTMLElement | null) => {
      if (el) dropTargetRefs.current.set(planId, el);
      else dropTargetRefs.current.delete(planId);
    },
    [dropTargetRefs],
  );

  const handleToggleExpand = useCallback((planId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(planId)) next.delete(planId);
      else next.add(planId);
      return next;
    });
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-full flex-col gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Spinner size="sm" />
          <span>Loading test plans from Xray…</span>
        </div>
        <Skeleton className="h-8 w-full" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded border border-slate-100 px-3 py-2 dark:border-slate-700"
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
      <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
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

      {/* Status filter chips */}
      {availableStatuses.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {availableStatuses.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter((prev) => (prev === s ? null : s))}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                statusFilter === s
                  ? "border-slate-700 bg-slate-700 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-500",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          {filtered.length} plan{filtered.length !== 1 ? "s" : ""}
          {isDragging && <span className="ml-2 text-slate-400">— drop a set to add its tests</span>}
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

      <div className="flex-1 space-y-2 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-sm italic text-slate-400">
            {q || statusFilter
              ? "No test plans match the filter."
              : `No test plans found in ${projectKey}.`}
          </p>
        ) : (
          filtered.map((plan) => (
            <TestPlanDropTarget
              key={plan.issue_id}
              testPlan={plan}
              isExpanded={expandedIds.has(plan.issue_id)}
              isDragging={isDragging}
              isHoveredTarget={hoveredPlanId === plan.issue_id}
              onRegisterDrop={handleRegisterDrop}
              onToggleExpand={handleToggleExpand}
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
