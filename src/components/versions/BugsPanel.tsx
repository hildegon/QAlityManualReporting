import { useState, useMemo } from "react";
import { Bug, Search, Filter, X, Loader2, User } from "lucide-react";
import { cn } from "@/components/ui/utils";
import { priorityClass, statusCategoryClass } from "./utils";
import { CreateBugModal } from "@/components/bugs/CreateBugModal";
import { IssueDetailModal } from "./IssueDetailModal";
import type { TestRunHistory } from "@/services/queries";
import type { JiraBug, JiraVersion } from "@/types";

const PRIORITY_ORDER = ["Highest", "High", "Medium", "Low", "Lowest"];

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  colorClass?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
        active
          ? "border-slate-700 bg-slate-700 text-white"
          : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-500",
      )}
    >
      {label}
    </button>
  );
}

interface BugsPanelProps {
  bugs: JiraBug[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  failedTests: TestRunHistory[];
  /** The version this panel belongs to — used for the Create Bug modal. Null hides the Create Bug button. */
  version: JiraVersion | null;
  projectKey: string;
}

export function BugsPanel({ bugs, isLoading, isError, error, failedTests, version, projectKey }: BugsPanelProps) {
  const [createBugOpen, setCreateBugOpen] = useState(false);
  const [selectedBugKey, setSelectedBugKey] = useState<string | null>(null);

  const prioritySummary = useMemo(() => {
    const list = bugs ?? [];
    const counts: Record<string, number> = {};
    for (const b of list) {
      if (b.fields.status?.category?.key === "done") continue;
      const p = b.fields.priority?.name;
      if (p) counts[p] = (counts[p] ?? 0) + 1;
    }
    return PRIORITY_ORDER.filter((p) => counts[p])
      .concat(
        Object.keys(counts)
          .filter((p) => !PRIORITY_ORDER.includes(p))
          .sort(),
      )
      .map((p) => ({ name: p, count: counts[p] }));
  }, [bugs]);

  const bugToDetectingTests = useMemo(() => {
    const map = new Map<string, { testKey: string; testSummary: string }[]>();
    for (const test of failedTests) {
      for (const bugKey of test.linkedBugKeys) {
        const existing = map.get(bugKey) ?? [];
        existing.push({ testKey: test.testKey, testSummary: test.testSummary });
        map.set(bugKey, existing);
      }
    }
    return map;
  }, [failedTests]);

  const [search, setSearch] = useState("");
  const [activePriorities, setActivePriorities] = useState<Set<string>>(new Set());
  const [activeStatuses, setActiveStatuses] = useState<Set<string>>(new Set());
  const [activeAssignee, setActiveAssignee] = useState<string | null>(null);
  const [unresolvedOnly, setUnresolvedOnly] = useState(true);

  const { priorities, statuses, assignees } = useMemo(() => {
    const list = bugs ?? [];
    const pSet = new Set<string>();
    const sSet = new Set<string>();
    const aSet = new Set<string>();
    for (const b of list) {
      if (b.fields.priority?.name) pSet.add(b.fields.priority.name);
      if (b.fields.status?.name) sSet.add(b.fields.status.name);
      if (b.fields.assignee?.display_name) aSet.add(b.fields.assignee.display_name);
    }
    const sortedP = PRIORITY_ORDER.filter((p) => pSet.has(p)).concat(
      [...pSet].filter((p) => !PRIORITY_ORDER.includes(p)).sort(),
    );
    return { priorities: sortedP, statuses: [...sSet].sort(), assignees: [...aSet].sort() };
  }, [bugs]);

  const filtered = useMemo(() => {
    const list = bugs ?? [];
    const q = search.trim().toLowerCase();
    return list.filter((b) => {
      if (q && !b.fields.summary.toLowerCase().includes(q) && !b.key.toLowerCase().includes(q))
        return false;
      if (activePriorities.size > 0 && !activePriorities.has(b.fields.priority?.name ?? ""))
        return false;
      if (activeStatuses.size > 0 && !activeStatuses.has(b.fields.status?.name ?? "")) return false;
      if (activeAssignee !== null && (b.fields.assignee?.display_name ?? null) !== activeAssignee)
        return false;
      if (unresolvedOnly && b.fields.status?.category?.key === "done") return false;
      return true;
    });
  }, [bugs, search, activePriorities, activeStatuses, activeAssignee, unresolvedOnly]);

  const hasActiveFilters =
    search.trim() !== "" ||
    activePriorities.size > 0 ||
    activeStatuses.size > 0 ||
    activeAssignee !== null ||
    unresolvedOnly;

  function clearFilters() {
    setSearch("");
    setActivePriorities(new Set());
    setActiveStatuses(new Set());
    setActiveAssignee(null);
    setUnresolvedOnly(false);
  }

  function toggleSet(set: Set<string>, value: string): Set<string> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  if (isLoading) {
    return (
      <div className="flex h-16 items-center justify-center gap-2 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading bugs…</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
        Failed to load bugs: {String(error)}
      </div>
    );
  }

  const list = bugs ?? [];

  return (
    <div
      id="version-section-bugs"
      className="mt-4 overflow-hidden rounded-2xl border border-red-200 bg-white shadow-sm dark:border-red-900/60 dark:bg-slate-800"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 bg-red-50 px-4 py-2.5 dark:bg-red-950/60">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-red-500 dark:text-red-400">
          <Bug className="h-3.5 w-3.5" />
          Bugs ({list.length})
          {hasActiveFilters && (
            <span className="ml-1 rounded-full bg-red-600 px-1.5 py-0.5 text-white">
              {filtered.length} shown
            </span>
          )}
        </div>
        {version && (
          <button
            onClick={() => setCreateBugOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600"
          >
            <Bug className="h-3 w-3" />
            Create Bug
          </button>
        )}
        {prioritySummary.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {prioritySummary.map(({ name, count }) => (
              <span
                key={name}
                className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300"
                title={`${count} unresolved ${name} bug${count !== 1 ? "s" : ""}`}
              >
                <span className={cn("font-bold leading-none", priorityClass(name))}>●</span>
                <span className="font-semibold">{name}:</span>
                <span>{count}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="p-4">
        {list.length > 0 && (
          <div className="mb-3 space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                autoCorrect="off" autoCapitalize="off" spellCheck={false}
                type="text"
                placeholder="Search summary or key…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-8 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-slate-400 focus:bg-white dark:border-slate-700 dark:bg-slate-700 dark:text-slate-200 dark:placeholder-slate-500 dark:focus:border-slate-500 dark:focus:bg-slate-700"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Filter className="h-3.5 w-3.5 shrink-0 text-slate-300" />
              <FilterChip
                label="Unresolved"
                active={unresolvedOnly}
                onClick={() => setUnresolvedOnly((v) => !v)}
              />
              {priorities.map((p) => (
                <FilterChip
                  key={p}
                  label={p}
                  active={activePriorities.has(p)}
                  onClick={() => setActivePriorities((s) => toggleSet(s, p))}
                />
              ))}
              {statuses.map((s) => (
                <FilterChip
                  key={s}
                  label={s}
                  active={activeStatuses.has(s)}
                  onClick={() => setActiveStatuses((prev) => toggleSet(prev, s))}
                />
              ))}
              {assignees.map((a) => (
                <FilterChip
                  key={a}
                  label={a}
                  active={activeAssignee === a}
                  onClick={() => setActiveAssignee((prev) => (prev === a ? null : a))}
                />
              ))}
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="ml-auto text-xs text-slate-400 hover:text-slate-600"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>
        )}

        {filtered.length === 0 ? (
          <p className="text-xs italic text-slate-400">
            {list.length === 0
              ? "No bugs found for this version."
              : "No bugs match the current filters."}
          </p>
        ) : (
          <div className="space-y-1.5">
            {filtered.map((bug: JiraBug) => (
              <div
                key={bug.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedBugKey(bug.key)}
                onKeyDown={(e) => e.key === "Enter" && setSelectedBugKey(bug.key)}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 transition-colors hover:border-red-400 hover:bg-red-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-red-600 dark:hover:bg-red-950/40"
              >
                <span
                  className={cn(
                    "mt-0.5 shrink-0 font-bold leading-none",
                    priorityClass(bug.fields.priority?.name),
                  )}
                  title={bug.fields.priority?.name ?? "No priority"}
                >
                  ●
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-800 dark:text-slate-200">
                    {bug.fields.summary}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-slate-400">{bug.key}</p>
                  {(bugToDetectingTests.get(bug.key) ?? []).length > 0 && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      <span className="text-[10px] text-slate-400">Detected by:</span>
                      {bugToDetectingTests.get(bug.key)!.map(({ testKey, testSummary }) => (
                        <span
                          key={testKey}
                          title={testSummary}
                          className="inline-flex items-center rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300"
                        >
                          {testKey}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {bug.fields.assignee ? (
                  <span className="flex shrink-0 items-center gap-1 text-xs text-slate-400">
                    <User className="h-3 w-3" />
                    {bug.fields.assignee.display_name}
                  </span>
                ) : null}

                {bug.fields.status && (
                  <span
                    className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                      statusCategoryClass(bug.fields.status.category?.key),
                    )}
                  >
                    {bug.fields.status.name}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {version && (
        <CreateBugModal
          open={createBugOpen}
          onClose={() => setCreateBugOpen(false)}
          projectKey={projectKey}
          version={version}
        />
      )}

      {selectedBugKey && (
        <IssueDetailModal
          issueKey={selectedBugKey}
          projectKey={projectKey}
          versionName={version?.name ?? ""}
          onClose={() => setSelectedBugKey(null)}
        />
      )}
    </div>
  );
}
