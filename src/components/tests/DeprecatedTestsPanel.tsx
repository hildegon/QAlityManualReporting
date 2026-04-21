import { useState, useMemo, useRef, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Archive, Eye, Search, X } from "lucide-react";

import { useGetTests, useIsTestsStreaming, useIssueTransitions, queryKeys } from "@/services/queries";
import { useQueryClient } from "@tanstack/react-query";
import type { XrayTest, JiraTransition } from "@/types";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/EmptyState";
import { cn } from "@/components/ui/utils";
import { isDeprecatingStatus, categoryColor, type ToastFn } from "./utils";
import { TransitionMenu } from "./TransitionMenu";
import { TestDetailModal } from "@/components/versions/TestDetailModal";
import * as api from "@/services/tauri";
import { Spinner } from "@/components/ui/spinner";

// ── DeprecatedTestsPanel ──────────────────────────────────────────────────────

export interface DeprecatedTestsPanelProps {
  projectKey: string;
  enabled: boolean;
  onToast: ToastFn;
}

export function DeprecatedTestsPanel({
  projectKey,
  enabled,
  onToast,
}: DeprecatedTestsPanelProps) {
  const queryClient = useQueryClient();
  const { data: tests, isLoading } = useGetTests(projectKey, enabled);
  const isStreaming = useIsTestsStreaming(projectKey);

  const [search, setSearch] = useState("");
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkApplying, setBulkApplying] = useState(false);
  const headerCheckRef = useRef<HTMLInputElement>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  const deprecated = useMemo<XrayTest[]>(() => {
    if (!tests) return [];
    return tests.filter(
      (t) => t.jira.status?.name && isDeprecatingStatus(t.jira.status.name),
    );
  }, [tests]);

  const filtered = useMemo<XrayTest[]>(() => {
    if (!search) return deprecated;
    const lower = search.toLowerCase();
    return deprecated.filter(
      (t) =>
        t.jira.key.toLowerCase().includes(lower) ||
        t.jira.summary.toLowerCase().includes(lower),
    );
  }, [deprecated, search]);

  // Bulk transition support
  const firstSelectedKey = useMemo<string | null>(() => {
    if (selectedIds.size === 0) return null;
    const firstId = selectedIds.values().next().value as string;
    return filtered.find((t) => t.issue_id === firstId)?.jira.key ?? null;
  }, [selectedIds, filtered]);

  const { data: bulkTransitions, isLoading: bulkTransitionsLoading } =
    useIssueTransitions(firstSelectedKey);

  const applyBulkTransition = async (transition: JiraTransition) => {
    setBulkApplying(true);
    const targets = filtered.filter((t) => selectedIds.has(t.issue_id));
    let success = 0;
    let failed = 0;
    for (const test of targets) {
      try {
        await api.transitionIssue(test.jira.key, transition.id);
        success++;
      } catch {
        failed++;
      }
    }
    setBulkApplying(false);
    setSelectedIds(new Set());
    // Patch statuses in cache
    queryClient.setQueryData<XrayTest[]>(
      queryKeys.tests(projectKey),
      (prev) =>
        prev?.map((t) =>
          targets.some((tgt) => tgt.jira.key === t.jira.key)
            ? { ...t, jira: { ...t.jira, status: { name: transition.to.name } } }
            : t,
        ),
    );
    onToast(
      failed > 0
        ? `"${transition.to.name}" applied to ${success}/${targets.length} tests (${failed} failed)`
        : `"${transition.to.name}" applied to ${success} tests`,
      failed > 0 ? "error" : "success",
    );
  };

  useEffect(() => {
    if (headerCheckRef.current) {
      headerCheckRef.current.indeterminate =
        selectedIds.size > 0 && selectedIds.size < filtered.length;
    }
  }, [selectedIds.size, filtered.length]);

  useEffect(() => {
    if (parentRef.current) parentRef.current.scrollTop = 0;
  }, [search]);

  // Esc clears selection
  useEffect(() => {
    if (selectedIds.size === 0) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedIds(new Set());
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedIds.size]);

  const ROW_HEIGHT = 41;
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
    getItemKey: (index) => filtered[index]?.issue_id ?? index,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  if (!tests || tests.length === 0) {
    return <EmptyState icon={Archive} message="No tests loaded for this project." />;
  }

  if (deprecated.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 rounded-md border border-dashed border-emerald-200 bg-emerald-50/40 p-8 text-center dark:border-emerald-900/40 dark:bg-emerald-950/10">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
          <Archive className="h-6 w-6 text-emerald-600 dark:text-emerald-300" />
        </div>
        <div className="space-y-1">
          <p className="font-medium text-emerald-700 dark:text-emerald-300">
            All clear — no deprecated tests 🎉
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Every test in this project has an active status.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Search + stats (sticky) */}
      <div className="sticky top-0 z-10 mb-3 flex items-center gap-3 bg-white/95 pb-2 backdrop-blur dark:bg-slate-900/95">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by key or name…"
            className="h-8 pl-8 pr-8 text-sm"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3 text-xs text-slate-500">
          <span>
            {search
              ? `${filtered.length} of ${deprecated.length} deprecated`
              : `${filtered.length} deprecated`}
            {isStreaming ? "…" : ""}
          </span>
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="mb-2 flex items-center gap-2 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 dark:border-indigo-900/60 dark:bg-indigo-950/40">
          <span className="shrink-0 text-sm font-medium text-indigo-700 dark:text-indigo-300">
            {selectedIds.size} selected
          </span>
          <div className="mx-1 h-4 w-px bg-indigo-200 dark:bg-indigo-800" />
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
            className="text-indigo-500 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-200"
            title="Clear selection (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Virtualised list */}
      <div className="flex-1 overflow-hidden rounded-md border border-slate-200 dark:border-slate-700">
        {/* Sticky header */}
        <div className="grid grid-cols-[2.5rem_7rem_1fr_8rem_5rem] border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center py-2 pl-3">
            <input
              ref={headerCheckRef}
              type="checkbox"
              checked={selectedIds.size === filtered.length && filtered.length > 0}
              onChange={(e) =>
                setSelectedIds(
                  e.target.checked ? new Set(filtered.map((t) => t.issue_id)) : new Set(),
                )
              }
              className="h-3.5 w-3.5 cursor-pointer accent-teal-500"
            />
          </div>
          <div className="py-2 pl-2 pr-3">Key</div>
          <div className="py-2 pr-3">Summary</div>
          <div className="py-2 pr-3">Status</div>
          <div className="py-2 pr-2" />
        </div>

        {filtered.length === 0 ? (
          <div className="flex items-center justify-center p-6 text-sm text-slate-400">
            No tests match your filter.
          </div>
        ) : (
          <div ref={parentRef} className="overflow-y-auto" style={{ height: "calc(100% - 33px)" }}>
            <div
              style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}
            >
              {virtualizer.getVirtualItems().map((vRow) => {
                const test = filtered[vRow.index];
                if (!test) return null;
                const isSelected = selectedIds.has(test.issue_id);
                const statusName = test.jira.status?.name ?? "Unknown";
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
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(test.issue_id)) next.delete(test.issue_id);
                        else next.add(test.issue_id);
                        return next;
                      })
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(test.issue_id)) next.delete(test.issue_id);
                          else next.add(test.issue_id);
                          return next;
                        });
                      }
                    }}
                    className={cn(
                      "group grid cursor-pointer grid-cols-[2.5rem_7rem_1fr_8rem_5rem] items-center border-b border-slate-100 transition-colors dark:border-slate-800",
                      isSelected
                        ? "bg-indigo-50 dark:bg-indigo-950/30"
                        : "hover:bg-slate-50 dark:hover:bg-slate-800/50",
                    )}
                  >
                    {/* Checkbox */}
                    <div
                      className="flex items-center py-2 pl-3"
                      onClick={(e) => e.stopPropagation()}
                    >
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
                    {/* Status badge */}
                    <div className="py-2 pr-3">
                      <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium text-amber-700 bg-amber-100 dark:bg-amber-900/60 dark:text-amber-300">
                        {statusName}
                      </span>
                    </div>
                    {/* Actions */}
                    <div
                      className="flex items-center justify-end gap-1 py-2 pr-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        title="Preview test"
                        onClick={() => setPreviewKey(test.jira.key)}
                        className="rounded p-1 text-slate-400 opacity-0 transition-opacity hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100 dark:hover:bg-slate-700 dark:hover:text-slate-300"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <TransitionMenu
                        issueKey={test.jira.key}
                        onToast={onToast}
                        align="right"
                        triggerClassName="opacity-0 group-hover:opacity-100"
                        onTransitioned={(statusName) => {
                          onToast(`${test.jira.key} moved to "${statusName}"`, "success");
                          queryClient.setQueryData<XrayTest[]>(
                            queryKeys.tests(projectKey),
                            (prev) =>
                              prev?.map((t) =>
                                t.jira.key === test.jira.key
                                  ? { ...t, jira: { ...t.jira, status: { name: statusName } } }
                                  : t,
                              ),
                          );
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

      {previewKey && (
        <TestDetailModal
          testKey={previewKey}
          projectKey={projectKey}
          versionName=""
          onClose={() => setPreviewKey(null)}
        />
      )}
    </div>
  );
}
