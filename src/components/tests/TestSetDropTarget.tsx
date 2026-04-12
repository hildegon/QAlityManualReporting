import { memo, useState, useMemo, useCallback } from "react";
import { Ban, ChevronDown, ChevronRight, Layers, Pencil, Trash2 } from "lucide-react";

import {
  useGetTestSetTests,
  useRemoveTestsFromTestSet,
  useRenameIssue,
  queryKeys,
} from "@/services/queries";
import type { XrayTestSet } from "@/types";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/components/ui/utils";
import { isDeprecatingStatus } from "./utils";
import { TransitionMenu } from "./TransitionMenu";

export interface TestSetDropTargetProps {
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

export const TestSetDropTarget = memo(function TestSetDropTarget({
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

  const isSetDeprecated = !!(
    testSet.jira.status?.name && isDeprecatingStatus(testSet.jira.status.name)
  );

  return (
    <div
      ref={dropRef}
      className={cn(
        "overflow-hidden rounded-lg border transition-all duration-150",
        isHoveredTarget
          ? "border-slate-700 bg-slate-50 ring-2 ring-slate-700 dark:border-slate-400 dark:bg-slate-700 dark:ring-slate-400"
          : isDragging
            ? "border-slate-300 bg-white ring-1 ring-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:ring-slate-600"
            : isSetDeprecated
              ? "border-red-200 bg-white dark:border-red-900/50 dark:bg-slate-800"
              : "border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-800",
      )}
    >
      {isSetDeprecated && <div className="h-1 w-full bg-red-400 dark:bg-red-600" />}

      {/* Header */}
      <div className="flex w-full items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700">
        <button className="flex items-center gap-3 text-left" onClick={handleToggleExpand}>
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
          )}
          <Layers
            className={cn(
              "h-4 w-4 shrink-0",
              isSetDeprecated ? "text-red-300 dark:text-red-700" : "text-slate-400",
            )}
          />
          <span
            className={cn(
              "w-28 shrink-0 font-mono text-xs",
              isSetDeprecated
                ? "text-slate-400 line-through dark:text-slate-500"
                : "text-slate-500 dark:text-slate-400",
            )}
          >
            {testSet.jira.key}
          </span>
        </button>
        {isSetDeprecated && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300">
            <Ban className="h-3 w-3" />
            {testSet.jira.status!.name}
          </span>
        )}

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
              autoCorrect="off" autoCapitalize="off" spellCheck={false}
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
            onTransitioned={(name) => {
              if (isDeprecatingStatus(name)) onHide(testSet.jira.key);
            }}
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
                                      onToast(
                                        `Removed ${t.jira.key} from test set.`,
                                        "success",
                                      ),
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
