import { useState } from "react";
import { useGetTestSets, useGetTestSetTests } from "@/services/queries";
import { useProjectKey } from "@/hooks/useProjectKey";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronRight, Layers, RefreshCw } from "lucide-react";
import { cn } from "@/components/ui/utils";
import type { XrayTestSet } from "@/types";

export function TestSetsPage() {
  const projectKey = useProjectKey();
  const {
    data: testSets,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useGetTestSets(projectKey ?? undefined);

  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!projectKey) {
    return <EmptyState message="Set a Project Key in Settings to view test sets." />;
  }

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (isError) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return (
      <div className="space-y-3">
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          <p className="mb-1 font-medium">Failed to load test sets</p>
          <pre className="whitespace-pre-wrap break-words font-mono text-xs">{errorMessage}</pre>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          <RefreshCw className="mr-1.5 h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  const q = search.trim().toLowerCase();
  const filtered = (testSets ?? []).filter(
    (ts) =>
      !q || ts.jira.key.toLowerCase().includes(q) || ts.jira.summary.toLowerCase().includes(q),
  );

  const toggle = (id: string) => setExpandedId((prev) => (prev === id ? null : id));

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          Test Sets
          <span className="ml-2 text-sm font-normal text-slate-500">
            {projectKey} · {filtered.length}
            {filtered.length !== (testSets?.length ?? 0) && (
              <span> / {testSets?.length ?? 0}</span>
            )}
          </span>
        </h1>
        <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Reload
        </Button>
      </div>

      {/* Search filter */}
      <div className="mb-3">
        <Input
          className="max-w-xs"
          placeholder="Filter by key or name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {!filtered.length ? (
        <EmptyState
          message={
            q ? "No test sets match the current filter." : `No test sets found in ${projectKey}.`
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          {filtered.map((ts, idx) => {
            const isExpanded = expandedId === ts.issue_id;
            const isLast = idx === filtered.length - 1;
            return (
              <div key={ts.issue_id} className={cn(!isLast && "border-b border-slate-100")}>
                {/* Row header — click to toggle */}
                <button
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
                  onClick={() => toggle(ts.issue_id)}
                  aria-expanded={isExpanded}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                  )}
                  <span className="w-28 shrink-0 font-mono text-xs text-slate-500">
                    {ts.jira.key}
                  </span>
                  <span className="flex-1 text-sm text-slate-800">{ts.jira.summary}</span>
                </button>

                {/* Expandable tests panel */}
                {isExpanded && <TestSetPanel testSet={ts} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Expanded tests panel ──────────────────────────────────────────────────────

interface TestSetPanelProps {
  testSet: XrayTestSet;
}

function TestSetPanel({ testSet }: TestSetPanelProps) {
  const { data: tests, isLoading, isError, error } = useGetTestSetTests(testSet.issue_id);
  const [search, setSearch] = useState("");

  const q = search.trim().toLowerCase();
  const filtered = (tests ?? []).filter(
    (t) =>
      !q || t.jira.key.toLowerCase().includes(q) || t.jira.summary.toLowerCase().includes(q),
  );

  return (
    <div className="border-t border-slate-100 bg-slate-50/60 px-6 py-3">
      {isLoading && (
        <div className="flex items-center gap-2 py-2 text-sm text-slate-400">
          <Spinner size="sm" />
          Loading tests…
        </div>
      )}

      {isError && (
        <p className="py-2 text-sm text-red-600">{String(error)}</p>
      )}

      {!isLoading && !isError && (
        <>
          {/* Filter + count */}
          <div className="mb-2 flex items-center gap-3">
            <span className="text-xs text-slate-400">
              {filtered.length}
              {filtered.length !== (tests?.length ?? 0) && ` of ${tests?.length ?? 0}`} test
              {(tests?.length ?? 0) !== 1 ? "s" : ""}
            </span>
            <Input
              className="h-7 max-w-xs text-xs"
              placeholder="Filter tests…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {filtered.length === 0 ? (
            <p className="py-2 text-sm text-slate-400 italic">
              {q ? "No tests match the filter." : "This test set contains no tests."}
            </p>
          ) : (
            <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-3 py-2 text-left">Key</th>
                    <th className="px-3 py-2 text-left">Summary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((test) => (
                    <tr key={test.issue_id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-mono text-xs text-slate-500">
                        {test.jira.key}
                      </td>
                      <td className="px-3 py-2 text-slate-700">{test.jira.summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-48 flex-col items-center justify-center gap-3 text-slate-400">
      <Layers className="h-10 w-10 opacity-40" />
      <p className="text-sm">{message}</p>
    </div>
  );
}
