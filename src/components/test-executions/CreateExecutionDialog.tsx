import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useTestPlans,
  useGetTests,
  useGetTestSets,
  useCreateTestExecution,
  useTestSetMembership,
  queryKeys,
} from "@/services/queries";
import type { TestSetInfo } from "@/services/queries";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { statusVariant } from "@/components/ui/badge-utils";
import { cn } from "@/components/ui/utils";
import { BookOpen, ChevronDown, ChevronRight, FolderOpen, Layers, Search, X } from "lucide-react";
import type { XrayTest } from "@/types";
import * as api from "@/services/tauri";

export interface CreateExecutionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  executionProjectKey: string | null;
  contentProjectKey: string | null;
}

export function CreateExecutionDialog({
  open,
  onOpenChange,
  executionProjectKey,
  contentProjectKey,
}: CreateExecutionDialogProps) {
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [testPlanId, setTestPlanId] = useState<string>("");
  const [selectedTestIds, setSelectedTestIds] = useState<Set<string>>(new Set());
  const [testSearch, setTestSearch] = useState("");
  const [testSetSearch, setTestSetSearch] = useState("");
  const [addingSetId, setAddingSetId] = useState<string | null>(null);
  const [planDropdownOpen, setPlanDropdownOpen] = useState(false);
  const [planSearch, setPlanSearch] = useState("");
  const [rightExpandedIds, setRightExpandedIds] = useState<Set<string>>(new Set());

  const queryClient = useQueryClient();
  const createExecution = useCreateTestExecution();
  const planDropdownRef = useRef<HTMLDivElement>(null);

  const { data: testPlans, isLoading: plansLoading } = useTestPlans(
    open ? (contentProjectKey ?? null) : null,
  );
  const { data: tests, isLoading: testsLoading } = useGetTests(
    open ? (contentProjectKey ?? undefined) : undefined,
  );
  const { data: testSets, isLoading: testSetsLoading } = useGetTestSets(
    contentProjectKey ?? undefined,
  );
  const { membership, setToTests } = useTestSetMembership(contentProjectKey ?? null);

  const selectedPlan = useMemo(
    () => (testPlans ?? []).find((p) => p.issue_id === testPlanId),
    [testPlans, testPlanId],
  );

  const matchingPlans = useMemo(() => {
    const q = planSearch.toLowerCase().trim();
    return (testPlans ?? []).filter(
      (p) => !q || p.jira.key.toLowerCase().includes(q) || p.jira.summary.toLowerCase().includes(q),
    );
  }, [testPlans, planSearch]);

  const filteredTests = useMemo(() => {
    const q = testSearch.toLowerCase();
    return (tests ?? []).filter(
      (t) => !q || t.jira.key.toLowerCase().includes(q) || t.jira.summary.toLowerCase().includes(q),
    );
  }, [tests, testSearch]);

  const filteredTestSets = useMemo(() => {
    const q = testSetSearch.toLowerCase();
    return (testSets ?? []).filter(
      (ts) =>
        !q || ts.jira.key.toLowerCase().includes(q) || ts.jira.summary.toLowerCase().includes(q),
    );
  }, [testSets, testSetSearch]);

  const toggleRightSet = useCallback((setId: string) => {
    setRightExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(setId)) next.delete(setId);
      else next.add(setId);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!testPlanId || !contentProjectKey) {
      setSelectedTestIds(new Set());
      return;
    }
    let cancelled = false;
    queryClient
      .fetchQuery<XrayTest[]>({
        queryKey: queryKeys.testPlanTests(testPlanId),
        queryFn: () => api.getTestPlanTests(testPlanId),
        staleTime: Infinity,
      })
      .then((planTests) => {
        if (cancelled) return;
        const ids = new Set(planTests.map((t) => t.issue_id));
        setSelectedTestIds(ids);
        setRightExpandedIds(new Set(["__all__"]));
      });
    return () => {
      cancelled = true;
    };
  }, [testPlanId, contentProjectKey, queryClient]);

  useEffect(() => {
    if (!planDropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (planDropdownRef.current && !planDropdownRef.current.contains(e.target as Node)) {
        setPlanDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [planDropdownOpen]);

  const coveredSetIds = useMemo(() => {
    if (!membership.size || selectedTestIds.size === 0) return new Set<string>();
    const covered = new Set<string>();
    for (const testId of selectedTestIds) {
      const sets = membership.get(testId);
      if (sets) {
        for (const s of sets) {
          covered.add(s.issueId);
        }
      }
    }
    return covered;
  }, [membership, selectedTestIds]);

  const groupedSelected = useMemo(() => {
    const displayTests = testSearch.trim()
      ? filteredTests
      : (tests ?? []).filter((t) => selectedTestIds.has(t.issue_id));
    if (displayTests.length === 0) return null;

    const groups = new Map<string, { info: TestSetInfo; tests: XrayTest[] }>();
    const noSet: XrayTest[] = [];

    for (const test of displayTests) {
      const testSets = membership.get(test.issue_id);
      if (testSets && testSets.length > 0) {
        for (const s of testSets) {
          if (!groups.has(s.issueId)) {
            groups.set(s.issueId, { info: s, tests: [] });
          }
          groups.get(s.issueId)!.tests.push(test);
        }
      } else {
        noSet.push(test);
      }
    }

    return { groups, noSet };
  }, [tests, filteredTests, selectedTestIds, membership, testSearch]);

  const toggleTest = useCallback((issueId: string) => {
    setSelectedTestIds((prev) => {
      const next = new Set(prev);
      if (next.has(issueId)) next.delete(issueId);
      else next.add(issueId);
      return next;
    });
  }, []);

  const handleAddFromSet = useCallback(
    (issueId: string) => {
      if (!setToTests) return;
      setAddingSetId(issueId);
      const testIds = setToTests.get(issueId) ?? [];
      if (testIds.length > 0) {
        setSelectedTestIds((prev) => {
          const next = new Set(prev);
          for (const id of testIds) {
            next.add(id);
          }
          return next;
        });
      }
      setTimeout(() => setAddingSetId(null), 100);
    },
    [setToTests],
  );

  const resetForm = useCallback(() => {
    setSummary("");
    setDescription("");
    setTestPlanId("");
    setSelectedTestIds(new Set());
    setTestSearch("");
    setTestSetSearch("");
    setPlanSearch("");
    setAddingSetId(null);
    setPlanDropdownOpen(false);
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!summary.trim() || !executionProjectKey) return;
      createExecution.mutate(
        {
          projectKey: executionProjectKey,
          summary,
          description: description || undefined,
          ...(testPlanId ? { testPlanId } : {}),
          ...(selectedTestIds.size > 0 ? { testIssueIds: [...selectedTestIds] } : {}),
        },
        {
          onSuccess: () => {
            onOpenChange(false);
            resetForm();
          },
        },
      );
    },
    [
      summary,
      description,
      executionProjectKey,
      testPlanId,
      selectedTestIds,
      createExecution,
      onOpenChange,
      resetForm,
    ],
  );

  const renderTestCheckboxRow = (test: XrayTest) => (
    <tr key={test.issue_id} className="group hover:bg-slate-50 dark:hover:bg-slate-700">
      <td className="px-2 py-1.5 text-center">
        <input
          type="checkbox"
          className="h-3.5 w-3.5 accent-blue-600"
          checked={selectedTestIds.has(test.issue_id)}
          onChange={() => toggleTest(test.issue_id)}
        />
      </td>
      <td className="px-2 py-1.5 font-mono text-xs text-slate-500">{test.jira.key}</td>
      <td className="px-2 py-1.5 text-xs text-slate-700 dark:text-slate-300">
        {test.jira.summary}
      </td>
    </tr>
  );

  const renderRightGroup = (
    setId: string,
    groupTests: XrayTest[],
    icon: React.ReactNode,
    label: string,
    sublabel?: string,
    accentClass?: string,
  ) => {
    const isExpanded = rightExpandedIds.has(setId);
    const visible = testSearch.trim()
      ? groupTests.filter((t) => selectedTestIds.has(t.issue_id) || testSearch.trim())
      : groupTests;

    if (visible.length === 0) return null;

    return (
      <div
        key={setId}
        className="overflow-hidden rounded border border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-800"
      >
        <button
          type="button"
          onClick={() => toggleRightSet(setId)}
          className="flex w-full items-center gap-2 px-2.5 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700"
        >
          {isExpanded ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-slate-400" />
          )}
          {icon}
          <span className={cn("text-xs", accentClass ?? "text-slate-500")}>{label}</span>
          {sublabel && <span className="font-mono text-[10px] text-slate-400">{sublabel}</span>}
          <span className="ml-auto shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-400 dark:bg-slate-700 dark:text-slate-500">
            {visible.length}
          </span>
        </button>
        {isExpanded && (
          <div className="border-t border-slate-100 dark:border-slate-700">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {visible.map(renderTestCheckboxRow)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        if (!v) resetForm();
        onOpenChange(v);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 flex max-h-[90vh] w-full max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl bg-white shadow-xl dark:bg-slate-800">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
            <Dialog.Title className="text-lg font-semibold dark:text-slate-100">
              New Test Execution
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700">
                <X className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {/* Summary + Description — full width */}
              <div className="mb-5 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="exec-summary">Summary *</Label>
                  <Input
                    id="exec-summary"
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    placeholder="Regression suite — Sprint 42"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="exec-desc">Description</Label>
                  <Input
                    id="exec-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional description"
                  />
                </div>
              </div>

              {/* Two-column layout */}
              <div className="grid grid-cols-2 gap-6">
                {/* LEFT COLUMN — Sources */}
                <div className="space-y-5">
                  {/* Test Plan */}
                  <div className="space-y-1.5">
                    <Label>Test Plan</Label>
                    {plansLoading ? (
                      <div className="flex items-center gap-2 text-sm text-slate-400">
                        <Spinner size="sm" /> Loading test plans…
                      </div>
                    ) : (
                      <div ref={planDropdownRef} className="relative">
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-left hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:hover:border-slate-500"
                          onClick={() => setPlanDropdownOpen((prev) => !prev)}
                        >
                          {testPlanId && selectedPlan ? (
                            <>
                              <BookOpen className="h-4 w-4 shrink-0 text-indigo-400" />
                              <span className="font-mono text-xs text-indigo-500 dark:text-indigo-400">
                                {selectedPlan.jira.key}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-sm text-slate-800 dark:text-slate-200">
                                {selectedPlan.jira.summary}
                              </span>
                              {selectedPlan.jira.status && (
                                <Badge
                                  variant={statusVariant(selectedPlan.jira.status.name)}
                                  className="shrink-0"
                                >
                                  {selectedPlan.jira.status.name}
                                </Badge>
                              )}
                            </>
                          ) : (
                            <span className="text-sm text-slate-400">Select a test plan…</span>
                          )}
                          <ChevronDown
                            className={cn(
                              "ml-auto h-4 w-4 shrink-0 text-slate-400 transition-transform",
                              planDropdownOpen && "rotate-180",
                            )}
                          />
                        </button>

                        {planDropdownOpen && (
                          <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-600 dark:bg-slate-800">
                            <div className="p-2">
                              <div className="relative">
                                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                                <input
                                  autoCorrect="off"
                                  autoCapitalize="off"
                                  spellCheck={false}
                                  className="h-8 w-full rounded-md border border-slate-200 bg-white pl-8 pr-3 text-xs placeholder:text-slate-400 focus:border-slate-400 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:placeholder:text-slate-500"
                                  placeholder="Filter plans…"
                                  value={planSearch}
                                  onChange={(e) => setPlanSearch(e.target.value)}
                                />
                              </div>
                            </div>
                            <div className="max-h-52 overflow-y-auto border-t border-slate-100 dark:border-slate-700">
                              <button
                                type="button"
                                className={cn(
                                  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700",
                                  !testPlanId && "bg-slate-50 dark:bg-slate-700",
                                )}
                                onClick={() => {
                                  setTestPlanId("");
                                  setPlanDropdownOpen(false);
                                }}
                              >
                                <span className="text-sm text-slate-500">— None —</span>
                              </button>
                              {matchingPlans.length === 0 && planSearch.trim() && (
                                <p className="px-3 py-4 text-center text-xs text-slate-400">
                                  No plans match your filter.
                                </p>
                              )}
                              {matchingPlans.map((plan) => (
                                <button
                                  key={plan.issue_id}
                                  type="button"
                                  className={cn(
                                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700",
                                    testPlanId === plan.issue_id && "bg-slate-50 dark:bg-slate-700",
                                  )}
                                  onClick={() => {
                                    setTestPlanId(
                                      plan.issue_id === testPlanId ? "" : plan.issue_id,
                                    );
                                    setPlanDropdownOpen(false);
                                  }}
                                >
                                  <BookOpen className="h-4 w-4 shrink-0 text-indigo-400" />
                                  <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                                    {plan.jira.key}
                                  </span>
                                  <span className="min-w-0 flex-1 truncate text-slate-800 dark:text-slate-200">
                                    {plan.jira.summary}
                                  </span>
                                  {plan.jira.status && (
                                    <Badge
                                      variant={statusVariant(plan.jira.status.name)}
                                      className="shrink-0"
                                    >
                                      {plan.jira.status.name}
                                    </Badge>
                                  )}
                                  {testPlanId === plan.issue_id && (
                                    <span className="shrink-0 text-xs font-medium text-indigo-600 dark:text-indigo-400">
                                      Selected
                                    </span>
                                  )}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {testPlanId && selectedPlan && (
                      <p className="text-xs text-slate-400">
                        Its tests will be automatically added to this execution.
                      </p>
                    )}
                  </div>

                  {/* Test Sets */}
                  <div className="space-y-1.5">
                    <Label>
                      Test Sets
                      {coveredSetIds.size > 0 && (
                        <span className="ml-1.5 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-normal text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
                          {coveredSetIds.size} covered by plan
                        </span>
                      )}
                    </Label>
                    {testSetsLoading ? (
                      <div className="flex items-center gap-2 text-sm text-slate-400">
                        <Spinner size="sm" /> Loading test sets…
                      </div>
                    ) : (
                      <>
                        <Input
                          placeholder="Filter by key or name…"
                          value={testSetSearch}
                          onChange={(e) => setTestSetSearch(e.target.value)}
                        />
                        <div className="max-h-72 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-700">
                          {filteredTestSets.length === 0 ? (
                            <p className="px-3 py-4 text-center text-sm text-slate-400">
                              {testSetSearch
                                ? "No test sets match your filter."
                                : "No test sets found."}
                            </p>
                          ) : (
                            <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                              {filteredTestSets.map((ts) => {
                                const isCovered = coveredSetIds.has(ts.issue_id);
                                const totalInSet = setToTests?.get(ts.issue_id)?.length ?? 0;
                                const selectedInSet = (setToTests?.get(ts.issue_id) ?? []).filter(
                                  (id: string) => selectedTestIds.has(id),
                                ).length;
                                const allAdded = totalInSet > 0 && selectedInSet === totalInSet;

                                return (
                                  <li
                                    key={ts.issue_id}
                                    className="flex items-center justify-between gap-3 px-3 py-2.5"
                                  >
                                    <div className="flex min-w-0 items-center gap-2.5">
                                      <Layers
                                        className={cn(
                                          "h-4 w-4 shrink-0",
                                          isCovered
                                            ? "text-indigo-400"
                                            : "text-emerald-500 dark:text-emerald-400",
                                        )}
                                      />
                                      <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                                          {ts.jira.summary}
                                        </p>
                                        <p className="font-mono text-xs text-slate-400">
                                          {ts.jira.key}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                      {isCovered && (
                                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                                          In plan
                                        </span>
                                      )}
                                      {allAdded ? (
                                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                                          {totalInSet} ✓
                                        </span>
                                      ) : (
                                        totalInSet > 0 && (
                                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-400 dark:bg-slate-700 dark:text-slate-500">
                                            {totalInSet}
                                          </span>
                                        )
                                      )}
                                      {!allAdded && (
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          className="shrink-0"
                                          disabled={addingSetId !== null}
                                          onClick={() => void handleAddFromSet(ts.issue_id)}
                                        >
                                          {addingSetId === ts.issue_id ? (
                                            <Spinner size="sm" />
                                          ) : (
                                            "Add"
                                          )}
                                        </Button>
                                      )}
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* RIGHT COLUMN — Selected Tests preview */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>
                      {testSearch.trim() ? "All Tests" : "Selected Tests"}
                      <span className="ml-1.5 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-normal text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                        {selectedTestIds.size}
                      </span>
                    </Label>
                    <button
                      type="button"
                      className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      onClick={() => {
                        setRightExpandedIds((prev) => {
                          if (!groupedSelected) return new Set();
                          const all = new Set(prev);
                          for (const setId of groupedSelected.groups.keys()) {
                            all.add(setId);
                          }
                          if (groupedSelected.noSet.length > 0) all.add("__no_set__");
                          return all.size === prev.size ? new Set() : all;
                        });
                      }}
                    >
                      {groupedSelected &&
                      rightExpandedIds.size ===
                        groupedSelected.groups.size + (groupedSelected.noSet.length > 0 ? 1 : 0)
                        ? "Collapse all"
                        : "Expand all"}
                    </button>
                  </div>
                  <Input
                    placeholder="Search by key or summary…"
                    value={testSearch}
                    onChange={(e) => setTestSearch(e.target.value)}
                  />
                  <div className="max-h-72 overflow-y-auto space-y-1.5">
                    {testsLoading ? (
                      <div className="flex items-center gap-2 py-4 text-sm text-slate-400">
                        <Spinner size="sm" /> Loading tests…
                      </div>
                    ) : groupedSelected ? (
                      <>
                        {Array.from(groupedSelected.groups.entries()).map(
                          ([setId, { info, tests: groupTests }]) =>
                            renderRightGroup(
                              setId,
                              groupTests,
                              <Layers className="h-3.5 w-3.5 shrink-0 text-emerald-400" />,
                              info.summary,
                              info.key,
                            ),
                        )}
                        {groupedSelected.noSet.length > 0 &&
                          renderRightGroup(
                            "__no_set__",
                            groupedSelected.noSet,
                            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-400" />,
                            "No Test Set",
                            undefined,
                            "text-amber-600 dark:text-amber-400 font-medium",
                          )}
                      </>
                    ) : (
                      <p className="px-3 py-8 text-center text-sm italic text-slate-400">
                        {testSearch.trim()
                          ? "No tests match your search."
                          : "No tests selected. Select a test plan or add tests from a test set."}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="space-y-3 border-t border-slate-200 px-6 py-4 dark:border-slate-700">
              {createExecution.isError && (
                <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                  <p className="font-medium">Failed to create test execution</p>
                  <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-xs">
                    {String(createExecution.error)}
                  </pre>
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-400">
                  {selectedTestIds.size} test{selectedTestIds.size !== 1 ? "s" : ""} will be added
                </span>
                <div className="flex items-center gap-2">
                  <Dialog.Close asChild>
                    <Button type="button" variant="outline" onClick={resetForm}>
                      Cancel
                    </Button>
                  </Dialog.Close>
                  <Button
                    type="submit"
                    disabled={createExecution.isPending || !summary.trim() || !executionProjectKey}
                  >
                    {createExecution.isPending ? <Spinner size="sm" /> : "Create"}
                  </Button>
                </div>
              </div>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
