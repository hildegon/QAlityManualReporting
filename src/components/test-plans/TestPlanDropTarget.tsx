import { memo, useState, useCallback, useMemo } from "react";
import {
  useGetTestPlanTests,
  useRemoveTestsFromTestPlan,
  useRenameIssue,
  useTestSetMembership,
  queryKeys,
} from "@/services/queries";
import type { TestSetInfo } from "@/services/queries";
import { Badge } from "@/components/ui/badge";
import { statusVariant } from "@/components/ui/badge-utils";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/components/ui/utils";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Layers,
  Pencil,
  Trash2,
} from "lucide-react";
import type { TestPlan, XrayTest } from "@/types";

export interface TestPlanDropTargetProps {
  testPlan: TestPlan;
  isExpanded: boolean;
  isDragging: boolean;
  isHoveredTarget: boolean;
  onRegisterDrop: (planId: string, el: HTMLElement | null) => void;
  pendingPlanId: string | null;
  onToggleExpand: (planId: string) => void;
  projectKey: string;
  onToast: (msg: string, variant: "success" | "error") => void;
}

export const TestPlanDropTarget = memo(function TestPlanDropTarget({
  testPlan,
  isExpanded,
  isDragging,
  isHoveredTarget,
  onRegisterDrop,
  pendingPlanId,
  onToggleExpand,
  projectKey,
  onToast,
}: TestPlanDropTargetProps) {
  const planId = testPlan.issue_id;
  const dropRef = useCallback(
    (el: HTMLElement | null) => onRegisterDrop(planId, el),
    [onRegisterDrop, planId],
  );
  const handleToggleExpand = useCallback(() => onToggleExpand(planId), [onToggleExpand, planId]);
  const { data: tests, isLoading: testsLoading } = useGetTestPlanTests(
    isExpanded ? testPlan.issue_id : null,
  );
  const { membership, isLoading: membershipLoading } = useTestSetMembership(projectKey);
  const removeTests = useRemoveTestsFromTestPlan();
  const renameIssue = useRenameIssue();
  const [memberSearch, setMemberSearch] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [expandedSetIds, setExpandedSetIds] = useState<Set<string>>(new Set());
  const isPending = pendingPlanId === testPlan.issue_id;

  const filteredTests = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    return (tests ?? []).filter(
      (t) => !q || t.jira.key.toLowerCase().includes(q) || t.jira.summary.toLowerCase().includes(q),
    );
  }, [tests, memberSearch]);

  const filteredTestIds = useMemo(
    () => new Set(filteredTests.map((t) => t.issue_id)),
    [filteredTests],
  );

  const groupedBySet = useMemo(() => {
    if (!tests || !membership.size) return null;
    const groups = new Map<string, { info: TestSetInfo; tests: XrayTest[] }>();
    const ungrouped: XrayTest[] = [];

    for (const test of tests) {
      const sets = membership.get(test.issue_id);
      if (sets && sets.length > 0) {
        for (const s of sets) {
          if (!groups.has(s.issueId)) {
            groups.set(s.issueId, { info: s, tests: [] });
          }
          groups.get(s.issueId)!.tests.push(test);
        }
      } else {
        ungrouped.push(test);
      }
    }

    return { groups, ungrouped };
  }, [tests, membership]);

  const toggleSet = useCallback((setId: string) => {
    setExpandedSetIds((prev) => {
      const next = new Set(prev);
      if (next.has(setId)) next.delete(setId);
      else next.add(setId);
      return next;
    });
  }, []);

  const hasActiveFilter = memberSearch.trim().length > 0;

  const renderTestRow = (t: XrayTest) => (
    <tr key={t.issue_id} className="group hover:bg-slate-50 dark:hover:bg-slate-700">
      <td className="px-3 py-2 font-mono text-xs text-slate-500 dark:text-slate-500">
        {t.jira.key}
      </td>
      <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{t.jira.summary}</td>
      <td className="px-3 py-2 text-right">
        <button
          title="Remove from test plan"
          disabled={removeTests.isPending}
          onClick={() =>
            removeTests.mutate(
              {
                testPlanIssueId: testPlan.issue_id,
                testIssueIds: [t.issue_id],
                projectKey,
              },
              {
                onSuccess: () => onToast(`Removed ${t.jira.key} from test plan.`, "success"),
                onError: (err: unknown) =>
                  onToast(`Failed to remove test: ${String(err)}`, "error"),
              },
            )
          }
          className="rounded p-1 text-slate-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-red-900/40 dark:hover:text-red-400"
        >
          {removeTests.isPending && removeTests.variables?.testIssueIds[0] === t.issue_id ? (
            <Spinner size="sm" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
        </button>
      </td>
    </tr>
  );

  const renderTestTable = (groupTests: XrayTest[]) => {
    const visible = hasActiveFilter
      ? groupTests.filter((t) => filteredTestIds.has(t.issue_id))
      : groupTests;
    if (visible.length === 0 && hasActiveFilter) return null;

    return (
      <div className="overflow-hidden rounded border border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400 dark:bg-slate-700 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2 text-left">Key</th>
              <th className="px-3 py-2 text-left">Summary</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {visible.map(renderTestRow)}
          </tbody>
        </table>
      </div>
    );
  };

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
      <div className="flex w-full items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700">
        <button className="flex flex-1 items-center gap-3 text-left" onClick={handleToggleExpand}>
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
          )}
          <BookOpen className="h-4 w-4 shrink-0 text-indigo-400" />
          <span className="w-28 shrink-0 font-mono text-xs text-indigo-500 dark:text-indigo-400">
            {testPlan.jira.key}
          </span>
        </button>

        {isRenaming ? (
          <form
            className="flex flex-1 items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              const trimmed = renameDraft.trim();
              if (!trimmed || trimmed === testPlan.jira.summary) {
                setIsRenaming(false);
                return;
              }
              renameIssue.mutate(
                {
                  issueKey: testPlan.jira.key,
                  summary: trimmed,
                  queryKey: queryKeys.testPlans(projectKey),
                },
                { onSettled: () => setIsRenaming(false) },
              );
            }}
          >
            <input
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              autoFocus
              className="flex-1 rounded border border-slate-300 px-2 py-0.5 text-sm focus:border-slate-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:focus:border-slate-400"
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
              setRenameDraft(testPlan.jira.summary);
            }}
          >
            <span className="truncate">{testPlan.jira.summary}</span>
            <Pencil className="h-3.5 w-3.5 shrink-0 text-slate-300 opacity-0 group-hover:opacity-100" />
          </span>
        )}

        {isPending && <Spinner size="sm" />}
        {testPlan.jira.status && (
          <Badge variant={statusVariant(testPlan.jira.status.name)} className="shrink-0">
            {testPlan.jira.status.name}
          </Badge>
        )}
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
      </div>

      {isExpanded && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3 dark:border-slate-700 dark:bg-slate-700/40">
          {testsLoading ? (
            <div className="flex items-center gap-2 py-2 text-sm text-slate-400">
              <Spinner size="sm" />
              Loading tests…
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-center gap-3">
                <span className="text-xs text-slate-400">
                  {filteredTests.length}
                  {filteredTests.length !== (tests?.length ?? 0) &&
                    ` of ${tests?.length ?? 0}`}{" "}
                  test{(tests?.length ?? 0) !== 1 ? "s" : ""}
                  {groupedBySet && (
                    <span className="ml-1 text-slate-300">
                      across {groupedBySet.groups.size} set
                      {groupedBySet.groups.size !== 1 ? "s" : ""}
                      {groupedBySet.ungrouped.length > 0 && ", with no test set"}
                    </span>
                  )}
                </span>
                <Input
                  className="h-7 max-w-xs text-xs"
                  placeholder="Filter…"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                />
              </div>
              {filteredTests.length === 0 ? (
                <p className="py-2 text-xs italic text-slate-400">
                  {memberSearch.trim()
                    ? "No tests match the filter."
                    : "This test plan contains no tests yet. Drag test sets here to add them."}
                </p>
              ) : groupedBySet ? (
                <div className="space-y-2">
                  {Array.from(groupedBySet.groups.entries()).map(
                    ([setId, { info, tests: groupTests }]) => {
                      const visible = hasActiveFilter
                        ? groupTests.filter((t) => filteredTestIds.has(t.issue_id))
                        : groupTests;
                      if (hasActiveFilter && visible.length === 0) return null;
                      const isSetExpanded = expandedSetIds.has(setId);

                      return (
                        <div
                          key={setId}
                          className="overflow-hidden rounded border border-emerald-200/40 bg-white dark:border-emerald-800/30 dark:bg-slate-800"
                        >
                          <div className="border-l-2 border-emerald-400/60">
                            <button
                              onClick={() => toggleSet(setId)}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700"
                            >
                              {isSetExpanded ? (
                                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                              )}
                              <Layers className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                              <span className="font-mono text-xs text-slate-500">{info.key}</span>
                              <span className="truncate text-xs text-slate-600 dark:text-slate-300">
                                {info.summary}
                              </span>
                              <span className="ml-auto shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-500 dark:bg-emerald-900/30 dark:text-emerald-400">
                                {visible.length} test{visible.length !== 1 ? "s" : ""}
                              </span>
                            </button>
                          </div>
                          {isSetExpanded && (
                            <div className="border-t border-slate-100 dark:border-slate-700">
                              {renderTestTable(groupTests)}
                            </div>
                          )}
                        </div>
                      );
                    },
                  )}
                  {groupedBySet.ungrouped.length > 0 &&
                    (!hasActiveFilter ||
                      groupedBySet.ungrouped.some((t) => filteredTestIds.has(t.issue_id))) && (
                      <div className="overflow-hidden rounded border border-amber-200/40 bg-white dark:border-amber-800/30 dark:bg-slate-800">
                        <div className="border-l-2 border-amber-400/60">
                          <button
                            onClick={() => toggleSet("__no_set__")}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700"
                          >
                            {expandedSetIds.has("__no_set__") ? (
                              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                            )}
                            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                            <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                              No Test Set
                            </span>
                            <span className="ml-auto shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-xs text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
                              {hasActiveFilter
                                ? groupedBySet.ungrouped.filter((t) =>
                                    filteredTestIds.has(t.issue_id),
                                  ).length
                                : groupedBySet.ungrouped.length}{" "}
                              test
                              {groupedBySet.ungrouped.length !== 1 ? "s" : ""}
                            </span>
                          </button>
                        </div>
                        {expandedSetIds.has("__no_set__") && (
                          <div className="border-t border-slate-100 dark:border-slate-700">
                            {renderTestTable(groupedBySet.ungrouped)}
                          </div>
                        )}
                      </div>
                    )}
                </div>
              ) : membershipLoading ? (
                <div className="flex items-center gap-2 py-2 text-xs text-slate-400">
                  <Spinner size="sm" />
                  Grouping by test set…
                </div>
              ) : (
                renderTestTable(filteredTests)
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
});
