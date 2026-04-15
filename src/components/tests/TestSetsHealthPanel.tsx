import { memo, useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Ban, ChevronDown, ChevronRight, Search, Tag, X } from "lucide-react";

import {
  useGetTestSets,
  useGetTestSetTestsWithStatus,
  useRemoveTestsFromTestSet,
} from "@/services/queries";
import type { XrayTest, XrayTestSet, XrayTestWithStatus } from "@/types";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/EmptyState";
import { cn } from "@/components/ui/utils";
import { isDeprecatingStatus, type ToastFn } from "./utils";
import { TransitionMenu } from "./TransitionMenu";

// ── TestSetHealthRow ──────────────────────────────────────────────────────────

const TestSetHealthRow = memo(function TestSetHealthRow({
  testSet,
  projectKey,
  onToast,
  preloadedTests,
}: {
  testSet: XrayTestSet;
  projectKey: string;
  onToast: ToastFn;
  preloadedTests?: XrayTest[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Only fetch from API when expanded — avoids N+1 calls on tab open
  const { data: fetchedTests, isLoading } = useGetTestSetTestsWithStatus(
    expanded ? testSet.issue_id : null,
  );
  const removeTests = useRemoveTestsFromTestSet();
  const rowHeaderCheckRef = useRef<HTMLInputElement>(null);

  // Use fetched data when available (expanded), fall back to preloaded data
  const tests: XrayTestWithStatus[] | XrayTest[] | undefined = fetchedTests ?? preloadedTests;

  const deprecated = useMemo(
    () =>
      tests?.filter((t) => t.jira.status?.name && isDeprecatingStatus(t.jira.status.name)) ?? [],
    [tests],
  );

  useEffect(() => {
    if (rowHeaderCheckRef.current) {
      rowHeaderCheckRef.current.indeterminate =
        selectedIds.size > 0 && selectedIds.size < (tests?.length ?? 0);
    }
  }, [selectedIds.size, tests?.length]);

  const handleRemoveSelected = useCallback(async () => {
    const ids = [...selectedIds];
    try {
      await removeTests.mutateAsync({
        testSetIssueId: testSet.issue_id,
        testIssueIds: ids,
        projectKey,
      });
      setSelectedIds(new Set());
      onToast(
        `Removed ${ids.length} test${ids.length !== 1 ? "s" : ""} from ${testSet.jira.key}`,
        "success",
      );
    } catch (e) {
      onToast(`Failed to remove: ${String(e)}`, "error");
    }
  }, [selectedIds, testSet, projectKey, removeTests, onToast]);

  const handleRemoveDeprecated = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      const ids = deprecated.map((t) => t.issue_id);
      try {
        await removeTests.mutateAsync({
          testSetIssueId: testSet.issue_id,
          testIssueIds: ids,
          projectKey,
        });
        onToast(
          `Removed ${ids.length} deprecated test${ids.length !== 1 ? "s" : ""} from ${testSet.jira.key}`,
          "success",
        );
      } catch (e) {
        onToast(`Failed: ${String(e)}`, "error");
      }
    },
    [deprecated, testSet, projectKey, removeTests, onToast],
  );

  const isSetDeprecated = !!(
    testSet.jira.status?.name && isDeprecatingStatus(testSet.jira.status.name)
  );

  return (
    <div
      className={cn(
        "border-b border-slate-200 last:border-b-0 dark:border-slate-700",
        isSetDeprecated && "bg-red-50/60 dark:bg-red-950/20",
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "group flex w-full items-center gap-2 px-3 py-2.5",
          isSetDeprecated
            ? "hover:bg-red-100/60 dark:hover:bg-red-950/40"
            : "hover:bg-slate-50 dark:hover:bg-slate-800/50",
        )}
      >
        {/* Expand toggle — takes all available space */}
        <button
          type="button"
          onClick={() => setExpanded((p) => !p)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
          )}
          <span
            className={cn(
              "font-mono text-xs",
              isSetDeprecated
                ? "text-red-400 line-through dark:text-red-700"
                : "text-slate-500 dark:text-slate-400",
            )}
          >
            {testSet.jira.key}
          </span>
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-sm",
              isSetDeprecated
                ? "text-red-500 line-through dark:text-red-600"
                : "text-slate-800 dark:text-slate-200",
            )}
          >
            {testSet.jira.summary}
          </span>
          {isSetDeprecated && (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/50 dark:text-red-300">
              <Ban className="h-3 w-3" />
              {testSet.jira.status!.name}
            </span>
          )}
        </button>

        {/* Actions */}
        {deprecated.length > 0 && (
          <>
            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              {deprecated.length} deprecated
            </span>
            <button
              type="button"
              onClick={handleRemoveDeprecated}
              disabled={removeTests.isPending}
              className="shrink-0 rounded px-2 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              Remove all
            </button>
          </>
        )}
        <div className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
          <TransitionMenu issueKey={testSet.jira.key} onToast={onToast} align="right" />
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-slate-100 dark:border-slate-800">
          {/* Bulk selection bar */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 border-b border-slate-700 bg-slate-800 px-3 py-2">
              <span className="text-sm font-medium text-slate-200">{selectedIds.size} selected</span>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => void handleRemoveSelected()}
                disabled={removeTests.isPending}
                className="rounded px-2 py-0.5 text-xs font-medium text-red-400 hover:bg-red-900/20 disabled:opacity-50"
              >
                Remove from set
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center gap-2 p-3 text-sm text-slate-400">
              <Spinner size="sm" />
              Loading tests…
            </div>
          ) : !tests?.length ? (
            <p className="px-4 py-3 text-xs italic text-slate-400">No tests in this set.</p>
          ) : (
            <div>
              {/* Column header */}
              <div className="grid grid-cols-[2.5rem_1fr_9rem_2.5rem] border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-800/50">
                <div className="flex items-center py-1.5 pl-8">
                  <input
                    ref={rowHeaderCheckRef}
                    type="checkbox"
                    checked={selectedIds.size === tests.length}
                    onChange={(e) =>
                      setSelectedIds(
                        e.target.checked ? new Set(tests.map((t) => t.issue_id)) : new Set(),
                      )
                    }
                    className="h-3.5 w-3.5 cursor-pointer accent-teal-500"
                  />
                </div>
                <div className="py-1.5">Test</div>
                <div className="py-1.5">Status</div>
                <div className="py-1.5" />
              </div>

              {tests.map((test) => {
                const isDeprecated = test.jira.status?.name
                  ? isDeprecatingStatus(test.jira.status.name)
                  : false;
                const isSelected = selectedIds.has(test.issue_id);
                return (
                  <div
                    key={test.issue_id}
                    className={cn(
                      "group grid grid-cols-[2.5rem_1fr_9rem_2.5rem] items-center border-b border-slate-50 dark:border-slate-800/50",
                      isSelected
                        ? "bg-teal-50 dark:bg-teal-900/20"
                        : isDeprecated
                          ? "bg-red-50/40 dark:bg-red-900/10"
                          : "hover:bg-slate-50 dark:hover:bg-slate-800/50",
                    )}
                  >
                    <div className="flex items-center py-1.5 pl-8">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) =>
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(test.issue_id);
                            else next.delete(test.issue_id);
                            return next;
                          })
                        }
                        className="h-3.5 w-3.5 cursor-pointer accent-teal-500 opacity-0 transition-opacity group-hover:opacity-100"
                        style={isSelected ? { opacity: 1 } : undefined}
                      />
                    </div>
                    <div className="min-w-0 py-1.5 pr-3">
                      <span className="mr-2 font-mono text-xs text-slate-500 dark:text-slate-400">
                        {test.jira.key}
                      </span>
                      <span
                        className="text-sm text-slate-800 dark:text-slate-200"
                        title={test.jira.summary}
                      >
                        {test.jira.summary}
                      </span>
                    </div>
                    <div className="py-1.5 pr-3">
                      {test.jira.status?.name ? (
                        <span
                          className={cn(
                            "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium",
                            isDeprecated
                              ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                              : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
                          )}
                        >
                          {test.jira.status.name}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </div>
                    <div className="py-1.5 pr-2">
                      <button
                        type="button"
                        title={`Remove from ${testSet.jira.key}`}
                        disabled={removeTests.isPending}
                        onClick={() =>
                          removeTests.mutate(
                            {
                              testSetIssueId: testSet.issue_id,
                              testIssueIds: [test.issue_id],
                              projectKey,
                            },
                            {
                              onSuccess: () =>
                                onToast(
                                  `Removed ${test.jira.key} from ${testSet.jira.key}`,
                                  "success",
                                ),
                              onError: (e) => onToast(`Failed: ${String(e)}`, "error"),
                            },
                          )
                        }
                        className="flex h-6 w-6 items-center justify-center rounded text-slate-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 disabled:opacity-30 dark:hover:bg-red-900/20"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

// ── TestSetsHealthPanel ────────────────────────────────────────────────────────

export function TestSetsHealthPanel({
  projectKey,
  onToast,
  allTests,
  membership,
}: {
  projectKey: string;
  onToast: ToastFn;
  allTests?: XrayTest[];
  membership?: Map<string, { issueId: string }[]>;
}) {
  const { data: testSets, isLoading } = useGetTestSets(projectKey);
  const [search, setSearch] = useState("");

  // Build reverse map: setId → XrayTest[] from preloaded data
  const setTestsMap = useMemo(() => {
    const map = new Map<string, XrayTest[]>();
    if (!allTests || !membership) return map;
    for (const test of allTests) {
      const sets = membership.get(test.issue_id);
      if (!sets) continue;
      for (const s of sets) {
        const arr = map.get(s.issueId) ?? [];
        arr.push(test);
        map.set(s.issueId, arr);
      }
    }
    return map;
  }, [allTests, membership]);

  const filtered = useMemo(() => {
    if (!testSets) return [];
    if (!search) return testSets;
    const lower = search.toLowerCase();
    return testSets.filter(
      (s) =>
        s.jira.key.toLowerCase().includes(lower) || s.jira.summary.toLowerCase().includes(lower),
    );
  }, [testSets, search]);

  if (isLoading) {
    return (
      <div className="space-y-2 p-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (!testSets?.length) {
    return <EmptyState icon={Tag} message="No test sets found for this project." />;
  }

  return (
    <div className="flex h-full flex-col">
      {/* Search */}
      <div className="mb-3 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter test sets…"
            className="h-8 pl-8 text-sm"
          />
        </div>
        <span className="shrink-0 text-xs text-slate-500">
          {filtered.length} set{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>
      <p className="mb-2 text-xs text-slate-400">
        Expand a test set to see its tests and remove deprecated ones.
      </p>

      <div className="flex-1 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-700">
        {filtered.length === 0 ? (
          <p className="p-4 text-sm text-slate-400">No test sets match your filter.</p>
        ) : (
          filtered.map((testSet) => {
            const pre = setTestsMap.get(testSet.issue_id);
            return (
              <TestSetHealthRow
                key={testSet.issue_id}
                testSet={testSet}
                projectKey={projectKey}
                onToast={onToast}
                {...(pre ? { preloadedTests: pre } : {})}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
