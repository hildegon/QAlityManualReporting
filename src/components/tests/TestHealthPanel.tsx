import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Activity, Eye, RefreshCw, Search, X } from "lucide-react";
import * as api from "@/services/tauri";

import { useGetTests, useIssueTransitions, useIsTestsStreaming } from "@/services/queries";
import type { XrayTest, JiraTransition, TestLastRunEntry } from "@/types";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/EmptyState";
import { cn } from "@/components/ui/utils";
import { categoryColor, isDeprecatingStatus, type ToastFn } from "./utils";
import { TransitionMenu } from "./TransitionMenu";
import { TestDetailModal } from "@/components/versions/TestDetailModal";

// ── Date helpers ──────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

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

// ── TestHealthPanel ───────────────────────────────────────────────────────────

export interface TestHealthPanelProps {
  projectKey: string;
  enabled: boolean;
  onRequestLoad: () => void;
  loadConfirmed: boolean | null;
  onToast: ToastFn;
  onReload: () => Promise<void>;
  isReloading: boolean;
  /** Lifted from parent so data survives tab switches. */
  healthMap: Map<string, TestLastRunEntry>;
  healthLoading: boolean;
  healthProgress: { processed: number; total: number };
}

export function TestHealthPanel({
  projectKey,
  enabled,
  onRequestLoad,
  loadConfirmed,
  onToast,
  onReload,
  isReloading,
  healthMap,
  healthLoading,
  healthProgress,
}: TestHealthPanelProps) {
  const { data: tests, isLoading: testsLoading } = useGetTests(projectKey, enabled);
  const isStreaming = useIsTestsStreaming(projectKey);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkApplying, setBulkApplying] = useState(false);
  const headerCheckRef = useRef<HTMLInputElement>(null);

  const [previewKey, setPreviewKey] = useState<string | null>(null);
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
      if (!aDate && bDate) return -1;
      if (aDate && !bDate) return 1;
      if (!aDate && !bDate) return a.jira.key.localeCompare(b.jira.key);
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
          await api.transitionIssue(test.jira.key, transition.id);
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
          {isStreaming || isReloading || testsLoading ? (
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

      {/* Virtualised list */}
      <div className="flex-1 overflow-hidden rounded-md border border-slate-200 dark:border-slate-700">
        {/* Sticky header */}
        <div className="grid grid-cols-[2.5rem_2rem_7rem_1fr_9rem_7rem_5rem] border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center py-2 pl-3">
            <input
              ref={headerCheckRef}
              type="checkbox"
              checked={selectedIds.size === sorted.length && sorted.length > 0}
              onChange={(e) =>
                setSelectedIds(
                  e.target.checked ? new Set(sorted.map((t) => t.issue_id)) : new Set(),
                )
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
            <div
              style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}
            >
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
                      "group grid cursor-pointer grid-cols-[2.5rem_2rem_7rem_1fr_9rem_7rem_5rem] items-center border-b border-slate-100 transition-colors dark:border-slate-800",
                      isSelected
                        ? "bg-teal-50 dark:bg-teal-900/20"
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
                    {/* Actions: preview + transition */}
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
