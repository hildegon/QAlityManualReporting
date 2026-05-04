import { memo, useState, useMemo, useCallback } from "react";
import { cn } from "@/components/ui/utils";
import { useGetTestSetTests } from "@/services/queries";
import { Spinner } from "@/components/ui/spinner";
import { ChevronDown, ChevronRight, GripVertical, Layers } from "lucide-react";
import type { XrayTest, XrayTestSet } from "@/types";

export interface TestSetSourceRowProps {
  testSet: XrayTestSet;
  selected: boolean;
  onToggle: () => void;
  onMouseDown: (e: React.MouseEvent) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  memberCount?: number;
}

export const TestSetSourceRow = memo(function TestSetSourceRow({
  testSet,
  selected,
  onToggle,
  onMouseDown,
  isExpanded,
  onToggleExpand,
  memberCount,
}: TestSetSourceRowProps) {
  const { data: tests, isLoading: testsLoading } = useGetTestSetTests(
    isExpanded ? testSet.issue_id : null,
  );

  const [memberSearch, setMemberSearch] = useState("");
  const filteredTests = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    return (tests ?? []).filter(
      (t) => !q || t.jira.key.toLowerCase().includes(q) || t.jira.summary.toLowerCase().includes(q),
    );
  }, [tests, memberSearch]);

  const handleToggleExpand = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleExpand();
    },
    [onToggleExpand],
  );

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border transition-colors",
        isExpanded
          ? selected
            ? "border-slate-700 bg-slate-700 text-white shadow-sm"
            : "border-slate-300 bg-white shadow-sm dark:border-slate-500 dark:bg-slate-800"
          : selected
            ? "border-slate-700 bg-slate-700 text-white"
            : "border-slate-200 bg-white text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200",
      )}
    >
      <div
        onMouseDown={onMouseDown}
        onClick={onToggle}
        className={cn(
          "flex cursor-pointer select-none items-center gap-2.5 px-3 py-2.5 transition-colors",
          !isExpanded && !selected && "hover:bg-slate-50 dark:hover:bg-slate-700",
        )}
      >
        <button
          onClick={handleToggleExpand}
          className={cn(
            "rounded p-0.5 transition-colors",
            selected
              ? "text-white/50 hover:text-emerald-300"
              : "text-slate-400 hover:text-emerald-500",
          )}
        >
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <Layers
          className={cn(
            "h-4 w-4 shrink-0",
            selected ? "text-emerald-300" : "text-emerald-500 dark:text-emerald-400",
          )}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{testSet.jira.summary}</p>
          <p
            className={cn(
              "mt-0.5 font-mono text-xs",
              selected ? "text-slate-300" : "text-slate-400",
            )}
          >
            {testSet.jira.key}
          </p>
        </div>
        {memberCount !== undefined && memberCount > 0 && (
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
              selected
                ? "bg-white/20 text-white"
                : "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
            )}
          >
            {memberCount} test{memberCount !== 1 ? "s" : ""}
          </span>
        )}
        <GripVertical
          className={cn("h-4 w-4 shrink-0", selected ? "text-white/40" : "text-slate-300")}
        />
      </div>

      {isExpanded && (
        <div className="border-t border-slate-200 bg-slate-50/60 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/60">
          {testsLoading ? (
            <div className="flex items-center gap-2 py-2 text-xs text-slate-400">
              <Spinner size="sm" />
              Loading tests…
            </div>
          ) : (
            <>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-xs text-slate-400">
                  {memberSearch.trim()
                    ? `${filteredTests.length} of ${tests?.length ?? 0}`
                    : `${tests?.length ?? 0} test${(tests?.length ?? 0) !== 1 ? "s" : ""}`}
                </span>
                <input
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className="h-7 w-full max-w-[180px] rounded-md border border-slate-200 bg-white px-2 text-xs placeholder:text-slate-400 focus:border-slate-400 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:placeholder:text-slate-500"
                  placeholder="Filter…"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                />
              </div>
              {filteredTests.length === 0 ? (
                <p className="py-2 text-xs italic text-slate-400">
                  {memberSearch.trim() ? "No tests match the filter." : "No tests in this set."}
                </p>
              ) : (
                <div className="overflow-hidden rounded border border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-800">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400 dark:bg-slate-700">
                      <tr>
                        <th className="px-2 py-1.5 text-left">Key</th>
                        <th className="px-2 py-1.5 text-left">Summary</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {filteredTests.map((t: XrayTest) => (
                        <tr key={t.issue_id} className="hover:bg-slate-50 dark:hover:bg-slate-700">
                          <td className="px-2 py-1.5 font-mono text-slate-500">{t.jira.key}</td>
                          <td className="px-2 py-1.5 text-slate-700 dark:text-slate-300">
                            {t.jira.summary}
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
