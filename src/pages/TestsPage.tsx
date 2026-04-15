import { useState, useRef, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAddTestsToTestSet,
  useTestSetMembership,
  useReloadTests,
  useGetTests,
  useIsTestsStreaming,
  queryKeys,
} from "@/services/queries";
import { useContentProjectKey } from "@/hooks/useProjectKey";
import { useDragAndDrop } from "@/hooks/useDragAndDrop";
import { Toast } from "@/components/ui/toast";
import { showToast } from "@/components/ui/toast-utils";
import type { ToastMessage } from "@/components/ui/toast-utils";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHelpButton } from "@/components/common/PageHelpModal";
import { Button } from "@/components/ui/button";
import { AlertTriangle, FlaskConical, Layers, RefreshCw, Plus, Activity, ShieldAlert, Archive } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "@/components/ui/utils";
import { useHealthStore } from "@/stores/healthStore";
import { useUiStore } from "@/stores/uiStore";

import { loadHiddenKeys, saveHiddenKeys } from "@/components/tests/utils";
import { DragGhost } from "@/components/tests/DragGhost";
import { TestsPanel } from "@/components/tests/TestsPanel";
import { TestSetsPanel } from "@/components/tests/TestSetsPanel";
import { CreateTestSetDialog } from "@/components/tests/CreateTestSetDialog";
import { TestSetsHealthPanel } from "@/components/tests/TestSetsHealthPanel";
import { TestHealthPanel } from "@/components/tests/TestHealthPanel";
import { DeprecatedTestsPanel } from "@/components/tests/DeprecatedTestsPanel";

export function TestsPage() {
  const projectKey = useContentProjectKey();
  const queryClient = useQueryClient();
  const addTestsToTestSet = useAddTestsToTestSet();
  const { membership } = useTestSetMembership(projectKey);

  /* Shared load-confirmation state — kept in Zustand so confirming in the
     Update tab (or any other view) automatically suppresses this modal too. */
  const { confirmedLoadProjects, confirmLoadProject } = useUiStore();
  const hasCachedTests = !!queryClient.getQueryData(queryKeys.tests(projectKey ?? ""));
  const isConfirmed = hasCachedTests || confirmedLoadProjects.has(projectKey ?? "");

  // true = load active | null = user dismissed without confirming | false = awaiting answer
  const [loadConfirmed, setLoadConfirmed] = useState<boolean | null>(isConfirmed ? true : false);

  // Sync with store: if another view confirms for the same project, update local state.
  useEffect(() => {
    if (projectKey && confirmedLoadProjects.has(projectKey) && loadConfirmed === false) {
      setLoadConfirmed(true);
    }
  }, [confirmedLoadProjects, projectKey, loadConfirmed]);
  const [activeTab, setActiveTab] = useState<"tests" | "health" | "sets-health" | "deprecated">("tests");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingSetId, setPendingSetId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [isRefreshingTests, setIsRefreshingTests] = useState(false);
  const [isRefreshingTestSets, setIsRefreshingTestSets] = useState(false);
  const [createSetOpen, setCreateSetOpen] = useState(false);

  // Hidden (deprecated) issue keys — persisted to localStorage per project
  const storageKeyTests = `qality_hidden_tests_${projectKey ?? ""}`;
  const storageKeySets = `qality_hidden_sets_${projectKey ?? ""}`;
  const [hiddenTestKeys, setHiddenTestKeys] = useState<Set<string>>(() =>
    loadHiddenKeys(storageKeyTests),
  );
  const [hiddenSetKeys, setHiddenSetKeys] = useState<Set<string>>(() =>
    loadHiddenKeys(storageKeySets),
  );
  const [showHiddenTests, setShowHiddenTests] = useState(false);
  const [showHiddenSets, setShowHiddenSets] = useState(false);

  const reloadTests = useReloadTests(projectKey ?? undefined);
  const testSetsRefetchRef = useRef<(() => Promise<unknown>) | null>(null);

  const handleRegisterTestSetsReload = useCallback((fn: () => Promise<unknown>) => {
    testSetsRefetchRef.current = fn;
  }, []);
  const handleToast = useCallback(
    (msg: string, variant: "success" | "error") => showToast(setToast, msg, variant),
    [],
  );

  const handleHideTest = useCallback(
    (issueKey: string) => {
      setHiddenTestKeys((prev) => {
        const next = new Set(prev);
        next.add(issueKey);
        saveHiddenKeys(storageKeyTests, next);
        return next;
      });
    },
    [storageKeyTests],
  );

  const handleHideSet = useCallback(
    (issueKey: string) => {
      setHiddenSetKeys((prev) => {
        const next = new Set(prev);
        next.add(issueKey);
        saveHiddenKeys(storageKeySets, next);
        return next;
      });
    },
    [storageKeySets],
  );

  const handleToggleShowHiddenTests = useCallback(() => setShowHiddenTests((p) => !p), []);
  const handleToggleShowHiddenSets = useCallback(() => setShowHiddenSets((p) => !p), []);

  const dropTargetRefs = useRef<Map<string, HTMLElement>>(new Map());

  const handleDropTests = useCallback(
    (testIssueIds: string[], testSetIssueId: string) => {
      if (!projectKey) return;
      setPendingSetId(testSetIssueId);
      addTestsToTestSet.mutate(
        { testSetIssueId, testIssueIds, projectKey },
        {
          onSuccess: () => {
            setPendingSetId(null);
            setSelectedIds((prev) => {
              const next = new Set(prev);
              for (const id of testIssueIds) next.delete(id);
              return next;
            });
            showToast(
              setToast,
              `Added ${testIssueIds.length} test${testIssueIds.length !== 1 ? "s" : ""} to set.`,
              "success",
            );
          },
          onError: (err) => {
            setPendingSetId(null);
            showToast(setToast, `Failed to add tests: ${String(err)}`, "error");
          },
        },
      );
    },
    [projectKey, addTestsToTestSet],
  );

  const {
    drag,
    ghostRef,
    hoveredTargetId: hoveredSetId,
    startDrag,
  } = useDragAndDrop(dropTargetRefs, handleDropTests);

  // ── Health data — persisted in Zustand so it survives tab/route switches ──────
  const { data: allTests } = useGetTests(projectKey ?? "", loadConfirmed === true);
  const isTestsStreaming = useIsTestsStreaming(projectKey ?? "");
  const healthStore = useHealthStore();
  const projectHealth = healthStore.getProjectHealth(projectKey ?? "");
  const healthMap = projectHealth.healthMap;
  const healthLoading = projectHealth.loading;
  const healthProgress = projectHealth.progress;

  useEffect(() => {
    if (!loadConfirmed || !allTests?.length || isTestsStreaming || !projectKey) return;
    if (activeTab !== "health" && activeTab !== "deprecated" && activeTab !== "sets-health") return;
    healthStore.startHealthFetch(
      projectKey,
      allTests.map((t) => t.issue_id),
      handleToast,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadConfirmed, projectKey, !!allTests?.length, isTestsStreaming, activeTab]);

  const handleReloadTests = useCallback(async () => {
    if (!projectKey) return;
    setIsRefreshingTests(true);
    healthStore.resetProject(projectKey);
    await reloadTests();
    setIsRefreshingTests(false);
  }, [reloadTests, projectKey, healthStore]);

  const handleReloadTestSets = useCallback(async () => {
    setIsRefreshingTestSets(true);
    await testSetsRefetchRef.current?.();
    setIsRefreshingTestSets(false);
  }, []);

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
      <EmptyState icon={FlaskConical} message="Set a Project Key in Settings to view tests." />
    );
  }

  return (
    <>
      {/* Warning dialog — shown once per launch when tests aren't cached */}
      <Dialog.Root
        open={loadConfirmed === false}
        onOpenChange={(open) => {
          if (!open) setLoadConfirmed(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-slate-200 bg-white p-6 shadow-lg dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-500" />
              <div className="space-y-3">
                <Dialog.Title className="text-lg font-semibold dark:text-slate-100">
                  Load all tests?
                </Dialog.Title>
                <Dialog.Description className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  Loading every test for{" "}
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {projectKey}
                  </span>{" "}
                  requires fetching all pages from the Xray API. Depending on the number of tests
                  this can take a <span className="font-medium">significant amount of time</span>.
                </Dialog.Description>
                <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  The results are cached for the rest of this session, so this is a{" "}
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    one-time operation per app launch
                  </span>{" "}
                  unless you explicitly reload.
                </p>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <Dialog.Close asChild>
                    <Button variant="outline" size="sm">
                      Cancel
                    </Button>
                  </Dialog.Close>
                  <Button
                    size="sm"
                    onClick={() => {
                      setLoadConfirmed(true);
                      if (projectKey) confirmLoadProject(projectKey);
                    }}
                  >
                    Load Tests
                  </Button>
                </div>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-slate-400" />
          <h1 className="text-xl font-semibold">
            Tests
            <span className="ml-2 text-sm font-normal text-slate-500">{projectKey}</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <PageHelpButton pageId="tests" />
          {activeTab === "tests" && (
            <Button size="sm" onClick={() => setCreateSetOpen(true)}>
              <Plus className="h-4 w-4" />
              New Test Set
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex items-center gap-1 border-b border-slate-200 dark:border-slate-700">
        <button
          onClick={() => setActiveTab("tests")}
          className={cn(
            "flex items-center gap-1.5 border-b-2 px-3 pb-2 text-sm font-medium transition-colors",
            activeTab === "tests"
              ? "border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300",
          )}
        >
          <Layers className="h-4 w-4" />
          Tests &amp; Sets
        </button>
        <button
          onClick={() => {
            setActiveTab("health");
            if (loadConfirmed === null) setLoadConfirmed(false);
          }}
          className={cn(
            "flex items-center gap-1.5 border-b-2 px-3 pb-2 text-sm font-medium transition-colors",
            activeTab === "health"
              ? "border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300",
          )}
        >
          <Activity className="h-4 w-4" />
          Health
        </button>
        <button
          onClick={() => setActiveTab("sets-health")}
          className={cn(
            "flex items-center gap-1.5 border-b-2 px-3 pb-2 text-sm font-medium transition-colors",
            activeTab === "sets-health"
              ? "border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300",
          )}
        >
          <ShieldAlert className="h-4 w-4" />
          Sets Health
        </button>
        <button
          onClick={() => {
            setActiveTab("deprecated");
            if (loadConfirmed === null) setLoadConfirmed(false);
          }}
          className={cn(
            "flex items-center gap-1.5 border-b-2 px-3 pb-2 text-sm font-medium transition-colors",
            activeTab === "deprecated"
              ? "border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300",
          )}
        >
          <Archive className="h-4 w-4" />
          Deprecated
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "tests" && (
        <div className="flex h-[calc(100vh-13rem)] gap-6">
          {/* Left: all tests */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                All Tests
              </p>
              <button
                onClick={() => void handleReloadTests()}
                disabled={isRefreshingTests || !loadConfirmed}
                title="Reload tests"
                className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-700"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", isRefreshingTests && "animate-spin")} />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <TestsPanel
                projectKey={projectKey}
                selectedIds={selectedIds}
                membership={membership}
                enabled={loadConfirmed === true}
                onToggle={handleToggle}
                onSelectAll={handleSelectAll}
                onClearAll={handleClearAll}
                onBeginDrag={startDrag}
                onToast={handleToast}
                hiddenKeys={hiddenTestKeys}
                showHidden={showHiddenTests}
                onToggleShowHidden={handleToggleShowHiddenTests}
                onHide={handleHideTest}
              />
            </div>
          </div>

          {/* Divider */}
          <div className="w-px shrink-0 bg-slate-200 dark:bg-slate-700" />

          {/* Right: test sets */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Test Sets
              </p>
              <button
                onClick={() => void handleReloadTestSets()}
                disabled={isRefreshingTestSets}
                title="Reload test sets"
                className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-700"
              >
                <RefreshCw
                  className={cn("h-3.5 w-3.5", isRefreshingTestSets && "animate-spin")}
                />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <TestSetsPanel
                projectKey={projectKey}
                isDragging={drag !== null}
                hoveredSetId={hoveredSetId}
                dropTargetRefs={dropTargetRefs}
                pendingSetId={pendingSetId}
                onRegisterReload={handleRegisterTestSetsReload}
                onToast={handleToast}
                hiddenKeys={hiddenSetKeys}
                showHidden={showHiddenSets}
                onToggleShowHidden={handleToggleShowHiddenSets}
                onHide={handleHideSet}
              />
            </div>
          </div>
        </div>
      )}

      {activeTab === "health" && (
        <div className="h-[calc(100vh-13rem)]">
          <TestHealthPanel
            projectKey={projectKey}
            enabled={loadConfirmed === true}
            loadConfirmed={loadConfirmed}
            onRequestLoad={() => setLoadConfirmed(false)}
            onToast={handleToast}
            onReload={handleReloadTests}
            isReloading={isRefreshingTests}
            healthMap={healthMap}
            healthLoading={healthLoading}
            healthProgress={healthProgress}
          />
        </div>
      )}

      {activeTab === "sets-health" && (
        <div className="h-[calc(100vh-13rem)]">
          <TestSetsHealthPanel
            projectKey={projectKey}
            onToast={handleToast}
            {...(allTests ? { allTests } : {})}
            {...(membership ? { membership } : {})}
          />
        </div>
      )}

      {activeTab === "deprecated" && (
        <div className="h-[calc(100vh-13rem)]">
          <DeprecatedTestsPanel
            projectKey={projectKey}
            enabled={loadConfirmed === true}
            onToast={handleToast}
          />
        </div>
      )}

      {/* Floating drag ghost */}
      {drag && <DragGhost drag={drag} ghostRef={ghostRef} />}

      <Toast message={toast} />

      {projectKey && (
        <CreateTestSetDialog
          open={createSetOpen}
          onOpenChange={setCreateSetOpen}
          projectKey={projectKey}
        />
      )}
    </>
  );
}

export default TestsPage;
