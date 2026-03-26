import { useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAddTestsToTestPlan, queryKeys } from "@/services/queries";
import { useContentProjectKey } from "@/hooks/useProjectKey";
import { useDragAndDrop } from "@/hooks/useDragAndDrop";
import { Toast } from "@/components/ui/toast";
import { showToast } from "@/components/ui/toast-utils";
import type { ToastMessage } from "@/components/ui/toast-utils";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { BookOpen, Plus, RefreshCw } from "lucide-react";
import { cn } from "@/components/ui/utils";
import type { XrayTest } from "@/types";
import * as api from "@/services/tauri";
import { TestSetsSourcePanel } from "@/components/test-plans/TestSetsSourcePanel";
import { TestPlansDropPanel } from "@/components/test-plans/TestPlansDropPanel";
import { TestPlanDragGhost } from "@/components/test-plans/TestPlanDragGhost";
import { CreatePlanDialog } from "@/components/test-plans/CreatePlanDialog";

export function TestPlansPage() {
  const projectKey = useContentProjectKey();
  const addTestsToTestPlan = useAddTestsToTestPlan();
  const queryClient = useQueryClient();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const testSetsRefetchRef = useRef<(() => Promise<unknown>) | null>(null);
  const plansRefetchRef = useRef<(() => Promise<unknown>) | null>(null);

  const handleRegisterTestSetsReload = useCallback((fn: () => Promise<unknown>) => {
    testSetsRefetchRef.current = fn;
  }, []);
  const handleRegisterPlansReload = useCallback((fn: () => Promise<unknown>) => {
    plansRefetchRef.current = fn;
  }, []);
  const handleToast = useCallback(
    (msg: string, variant: "success" | "error") => showToast(setToast, msg, variant),
    [],
  );

  /** Map from plan issueId → its DOM element for drop hit-testing. */
  const dropTargetRefs = useRef<Map<string, HTMLElement>>(new Map());

  const handleReload = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([testSetsRefetchRef.current?.(), plansRefetchRef.current?.()]);
    setIsRefreshing(false);
  }, []);

  /**
   * Called when one or more test sets are dropped onto a test plan.
   * Fetches the tests inside each set then calls addTestsToTestPlan.
   * Note: useDragAndDrop calls onDrop(ids, targetId) — here ids = testSetIssueIds.
   */
  const handleDropSets = useCallback(
    async (testSetIssueIds: string[], testPlanIssueId: string) => {
      if (!projectKey) return;
      setPendingPlanId(testPlanIssueId);
      try {
        // Resolve tests for all dropped sets in parallel.
        const pages = await Promise.all(
          testSetIssueIds.map((setId) =>
            queryClient.fetchQuery<XrayTest[]>({
              queryKey: queryKeys.testSetTests(setId),
              queryFn: () => api.getTestSetTests(setId),
              staleTime: 5 * 60 * 1_000,
            }),
          ),
        );
        const testIssueIds = [...new Set(pages.flat().map((t) => t.issue_id))];

        if (testIssueIds.length === 0) {
          showToast(setToast, "The selected test set(s) contain no tests.", "error");
          setPendingPlanId(null);
          return;
        }

        addTestsToTestPlan.mutate(
          { testPlanIssueId, testIssueIds, projectKey },
          {
            onSuccess: () => {
              setPendingPlanId(null);
              setSelectedIds((prev) => {
                const next = new Set(prev);
                for (const id of testSetIssueIds) next.delete(id);
                return next;
              });
              showToast(
                setToast,
                `Added ${testIssueIds.length} test${testIssueIds.length !== 1 ? "s" : ""} to plan.`,
                "success",
              );
            },
            onError: (err) => {
              setPendingPlanId(null);
              showToast(setToast, `Failed to add tests: ${String(err)}`, "error");
            },
          },
        );
      } catch (err) {
        setPendingPlanId(null);
        showToast(setToast, `Failed to fetch tests from set: ${String(err)}`, "error");
      }
    },
    [projectKey, queryClient, addTestsToTestPlan],
  );

  const {
    drag,
    ghostRef,
    hoveredTargetId: hoveredPlanId,
    startDrag,
  } = useDragAndDrop(dropTargetRefs, handleDropSets);

  const handleToggle = useCallback(
    (id: string) => {
      if (drag) return;
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [drag],
  );

  const handleSelectAll = useCallback((ids: string[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
  }, []);

  const handleClearAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  if (!projectKey) {
    return (
      <EmptyState icon={BookOpen} message="Set a Project Key in Settings to view test plans." />
    );
  }

  return (
    <>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-slate-400" />
          <h1 className="text-xl font-semibold">
            Test Plans
            <span className="ml-2 text-sm font-normal text-slate-500">{projectKey}</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void handleReload()}
            disabled={isRefreshing}
            title="Reload test sets and plans"
            className="rounded p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40 dark:hover:bg-slate-700 dark:text-slate-400"
          >
            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
          </button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            New plan
          </Button>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="flex h-[calc(100vh-10rem)] gap-6">
        {/* Left: test sets (drag sources) */}
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Test Sets
          </p>
          <div className="flex-1 overflow-hidden">
            <TestSetsSourcePanel
              projectKey={projectKey}
              selectedIds={selectedIds}
              onToggle={handleToggle}
              onSelectAll={handleSelectAll}
              onClearAll={handleClearAll}
              onBeginDrag={startDrag}
              onRegisterReload={handleRegisterTestSetsReload}
            />
          </div>
        </div>

        {/* Divider */}
        <div className="w-px shrink-0 bg-slate-200 dark:bg-slate-700" />

        {/* Right: test plans (drop targets) */}
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Test Plans
          </p>
          <div className="flex-1 overflow-hidden">
            <TestPlansDropPanel
              projectKey={projectKey}
              isDragging={drag !== null}
              hoveredPlanId={hoveredPlanId}
              dropTargetRefs={dropTargetRefs}
              pendingPlanId={pendingPlanId}
              onRegisterReload={handleRegisterPlansReload}
              onToast={handleToast}
            />
          </div>
        </div>
      </div>

      {/* Floating drag ghost */}
      {drag && <TestPlanDragGhost drag={drag} ghostRef={ghostRef} />}

      <Toast message={toast} />

      <CreatePlanDialog open={createOpen} onOpenChange={setCreateOpen} projectKey={projectKey} />
    </>
  );
}

export default TestPlansPage;
