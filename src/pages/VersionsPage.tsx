import { useState, useMemo, useCallback, useDeferredValue } from "react";
import {
  Tag,
  Loader2,
  CheckCircle,
  ChevronDown,
  Search,
  X,
  RefreshCw,
  Star,
  Layers,
  BarChart3,
  MessageSquare,
} from "lucide-react";
import { useProjectVersions, queryKeys } from "@/services/queries";
import { useQueryClient } from "@tanstack/react-query";
import { useExecutionProjectKey } from "@/hooks/useProjectKey";
import { parseRateLimitError } from "@/stores/uiStore";
import { useVersionsStore } from "@/stores/versionsStore";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/components/ui/utils";
import { TestExecutionDetail } from "@/components/test-execution/TestExecutionDetail";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHelpButton } from "@/components/common/PageHelpModal";
import type { TestExecution } from "@/types";

import { VersionCard } from "@/components/versions/VersionCard";
import { VersionGroupCard, GroupReportPanel } from "@/components/versions/VersionGroups";
import { ExecutionListPanel } from "@/components/versions/ExecutionListPanel";
import { ManageVersionsTab } from "@/components/versions/ManageVersionsTab";
import { FeedbackPanel } from "@/components/versions/FeedbackPanel";

// Small reusable section header for the sidebar
function SectionLabel({
  icon,
  label,
  count,
  accent = "slate",
  muted = false,
}: {
  icon?: React.ReactNode;
  label: string;
  count: number;
  accent?: "amber" | "violet" | "slate";
  muted?: boolean;
}) {
  const textColor =
    accent === "amber"
      ? "text-amber-500 dark:text-amber-400"
      : accent === "violet"
        ? "text-violet-500 dark:text-violet-400"
        : muted
          ? "text-slate-400 dark:text-slate-600"
          : "text-slate-500 dark:text-slate-400";
  return (
    <div className={cn("flex items-center gap-1.5 px-1 py-1 text-[10px] font-bold uppercase tracking-wider", textColor)}>
      {icon}
      {label}
      <span className="ml-auto rounded-full bg-slate-200/80 px-1.5 py-px text-slate-500 font-semibold dark:bg-slate-700 dark:text-slate-400">
        {count}
      </span>
    </div>
  );
}

export function VersionsPage() {
  const executionProjectKey = useExecutionProjectKey();
  const queryClient = useQueryClient();
  const {
    favourites,
    isFavourite,
    toggleFavourite,
    selectedVersionId: selectedVersionIdMap,
    setSelectedVersionId,
    healthDots,
    setHealthDot,
    qaApprovedVersions,
    setQaApproved,
    versionGroups,
  } = useVersionsStore();

  const {
    data: versions,
    isLoading: versionsLoading,
    isError: versionsError,
    error: versionsErr,
  } = useProjectVersions(executionProjectKey);

  const storedVersionId = executionProjectKey
    ? (selectedVersionIdMap[executionProjectKey] ?? null)
    : null;
  const selectedVersion = (versions ?? []).find((v) => v.id === storedVersionId) ?? null;

  const healthDotMap: Record<string, "green" | "amber" | "red"> = useMemo(
    () => (executionProjectKey && healthDots[executionProjectKey]) || {},
    [executionProjectKey, healthDots],
  );

  const [selectedExecution, setSelectedExecution] = useState<TestExecution | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [versionFilter, setVersionFilter] = useState("");
  const deferredVersionFilter = useDeferredValue(versionFilter);
  const [showReleased, setShowReleased] = useState(false);
  const [activeTab, setActiveTab] = useState<"report" | "feedback" | "manage">("report");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const projectGroups = executionProjectKey ? (versionGroups[executionProjectKey] ?? []) : [];
  const selectedGroup = projectGroups.find((g) => g.id === selectedGroupId) ?? null;

  const handleBack = () => setSelectedExecution(null);

  const handleSelectVersion = useCallback(
    (id: string) => {
      if (executionProjectKey) setSelectedVersionId(executionProjectKey, id);
      setSelectedGroupId(null);
      setSelectedExecution(null);
    },
    [executionProjectKey, setSelectedVersionId],
  );

  const handleSelectGroup = useCallback((id: string) => {
    setSelectedGroupId(id);
    if (executionProjectKey) setSelectedVersionId(executionProjectKey, null);
    setSelectedExecution(null);
  }, [executionProjectKey, setSelectedVersionId]);

  const handleReload = useCallback(async () => {
    if (!executionProjectKey) return;
    setIsRefreshing(true);
    const versionList = versions ?? [];
    const groupVersionNames = selectedGroup
      ? selectedGroup.versionIds
          .map((id) => versionList.find((v) => v.id === id)?.name)
          .filter(Boolean) as string[]
      : [];

    const toInvalidate = [
      queryClient.invalidateQueries({ queryKey: queryKeys.projectVersions(executionProjectKey) }),
      queryClient.invalidateQueries({ queryKey: ["version-run-stats"] }),
      queryClient.invalidateQueries({ queryKey: ["xray", "exec-summary"] }),
      queryClient.invalidateQueries({ queryKey: ["xray", "exec-summary-batch"] }),
      ...(selectedVersion
        ? [
            queryClient.invalidateQueries({
              queryKey: queryKeys.bugsByVersion(executionProjectKey, selectedVersion.name),
            }),
            queryClient.invalidateQueries({
              queryKey: queryKeys.testExecutionsByVersion(
                executionProjectKey,
                selectedVersion.name,
              ),
            }),
            queryClient.invalidateQueries({
              queryKey: queryKeys.versionIssues(executionProjectKey, selectedVersion.name),
            }),
          ]
        : []),
      ...groupVersionNames.flatMap((name) => [
        queryClient.invalidateQueries({
          queryKey: queryKeys.bugsByVersion(executionProjectKey, name),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.testExecutionsByVersion(executionProjectKey, name),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.versionIssues(executionProjectKey, name),
        }),
      ]),
    ];

    await Promise.all(toInvalidate);
    setIsRefreshing(false);
  }, [executionProjectKey, selectedVersion, selectedGroup, versions, queryClient]);

  const allVersions = useMemo(() => versions ?? [], [versions]);
  const filterQ = deferredVersionFilter.trim().toLowerCase();
  const favouriteVersions = useMemo(
    () =>
      allVersions.filter(
        (v) =>
          executionProjectKey &&
          isFavourite(executionProjectKey, v.id) &&
          (!filterQ || v.name.toLowerCase().includes(filterQ)),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allVersions, executionProjectKey, favourites, filterQ],
  );
  const unreleasedVersions = useMemo(
    () =>
      allVersions.filter(
        (v) =>
          !v.archived &&
          !v.released &&
          !(executionProjectKey && isFavourite(executionProjectKey, v.id)) &&
          (!filterQ || v.name.toLowerCase().includes(filterQ)),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allVersions, executionProjectKey, favourites, filterQ],
  );
  const releasedVersions = useMemo(
    () =>
      allVersions.filter(
        (v) =>
          !v.archived &&
          v.released &&
          !(executionProjectKey && isFavourite(executionProjectKey, v.id)) &&
          (!filterQ || v.name.toLowerCase().includes(filterQ)),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allVersions, executionProjectKey, favourites, filterQ],
  );
  const archivedVersions = useMemo(
    () =>
      allVersions.filter(
        (v) =>
          v.archived &&
          !(executionProjectKey && isFavourite(executionProjectKey, v.id)) &&
          (!filterQ || v.name.toLowerCase().includes(filterQ)),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allVersions, executionProjectKey, favourites, filterQ],
  );

  const handleToggleFavourite = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      if (!executionProjectKey) return;
      toggleFavourite(executionProjectKey, id);
    },
    [executionProjectKey, toggleFavourite],
  );

  const handleHealthUpdate = useCallback(
    (id: string, dot: "green" | "amber" | "red") => {
      if (executionProjectKey) setHealthDot(executionProjectKey, id, dot);
    },
    [executionProjectKey, setHealthDot],
  );

  const handleApprovalUpdate = useCallback(
    (id: string, approved: boolean) => {
      if (executionProjectKey) setQaApproved(executionProjectKey, id, approved);
    },
    [executionProjectKey, setQaApproved],
  );

  const qaApprovedSet = useMemo(
    () => new Set(executionProjectKey ? (qaApprovedVersions[executionProjectKey] ?? []) : []),
    [executionProjectKey, qaApprovedVersions],
  );

  if (!executionProjectKey) {
    return (
      <EmptyState icon={Tag} message="Set an Execution Project Key in Settings to view versions." />
    );
  }

  if (versionsLoading) {
    return (
      <div className="space-y-2">
        <div className="mb-4 flex items-center justify-between">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-8 w-20" />
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading project versions…</span>
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-slate-100 p-4 space-y-2 dark:border-slate-700"
          >
            <div className="flex items-center gap-3">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-16 rounded-full" />
            </div>
            <Skeleton className="h-3 w-48" />
          </div>
        ))}
      </div>
    );
  }

  if (versionsError) {
    const rateLimitUntil = parseRateLimitError(versionsErr);
    if (rateLimitUntil !== null) {
      const seconds = Math.max(0, Math.ceil((rateLimitUntil - Date.now()) / 1_000));
      return (
        <div className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
          <p className="font-medium">Rate limited by Jira</p>
          <p className="mt-0.5 text-xs">
            Too many requests. Please wait{seconds > 0 ? ` ~${seconds}s` : ""} and try again.
          </p>
        </div>
      );
    }
    return (
      <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
        <p className="mb-1 font-medium">Failed to load versions</p>
        <pre className="whitespace-pre-wrap break-words font-mono text-xs">
          {String(versionsErr)}
        </pre>
      </div>
    );
  }

  if (allVersions.length === 0) {
    return <EmptyState icon={Tag} message="No versions found for this project." />;
  }

  if (selectedExecution) {
    return <TestExecutionDetail execution={selectedExecution} onBack={handleBack} />;
  }

  return (
    <div className="flex h-full gap-5">
      {/* Sidebar — version list */}
      <div className="flex w-80 shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900">
        {/* Sidebar header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-3 py-2.5 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Versions
            </span>
            {executionProjectKey && (
              <span className="rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                {executionProjectKey}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <PageHelpButton pageId="versions" />
            <button
              onClick={handleReload}
              disabled={isRefreshing}
              title="Reload versions and data"
              className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600 disabled:opacity-40 dark:hover:bg-slate-700 dark:text-slate-400"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="shrink-0 px-2.5 py-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              autoCorrect="off" autoCapitalize="off" spellCheck={false}
              type="text"
              placeholder="Filter versions…"
              value={versionFilter}
              onChange={(e) => setVersionFilter(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white py-1.5 pl-8 pr-7 text-xs text-slate-700 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus:border-indigo-500"
            />
            {versionFilter && (
              <button
                onClick={() => setVersionFilter("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                aria-label="Clear filter"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto space-y-0.5 px-2.5 pb-3">
          {projectGroups.length > 0 && (
            <div className="mb-2">
              <SectionLabel icon={<Layers className="h-3 w-3" />} label="Groups" count={projectGroups.length} accent="violet" />
              <div className="mt-1 space-y-1">
                {projectGroups.map((g) => (
                  <VersionGroupCard
                    key={g.id}
                    group={g}
                    versions={allVersions}
                    isActive={selectedGroup?.id === g.id}
                    onClick={handleSelectGroup}
                  />
                ))}
              </div>
              <div className="my-2 border-t border-slate-200 dark:border-slate-700" />
            </div>
          )}

          {favouriteVersions.length > 0 && (
            <div className="mb-2">
              <SectionLabel icon={<Star className="h-3 w-3 fill-current" />} label="Favourites" count={favouriteVersions.length} accent="amber" />
              <div className="mt-1 space-y-1">
                {favouriteVersions.map((v) => (
                  <VersionCard
                    key={v.id}
                    version={v}
                    isActive={selectedVersion?.id === v.id}
                    isFavourite={true}
                    onClick={handleSelectVersion}
                    onToggleFavourite={handleToggleFavourite}
                    {...(healthDotMap[v.id] ? { healthDot: healthDotMap[v.id] } : {})}
                    qaApproved={qaApprovedSet.has(v.id)}
                  />
                ))}
              </div>
              {(unreleasedVersions.length > 0 || releasedVersions.length > 0 || archivedVersions.length > 0) && (
                <div className="my-2 border-t border-slate-200 dark:border-slate-700" />
              )}
            </div>
          )}

          {unreleasedVersions.length > 0 && (
            <div className="mb-2">
              <SectionLabel label="Unreleased" count={unreleasedVersions.length} accent="slate" />
              <div className="mt-1 space-y-1">
                {unreleasedVersions.map((v) => (
                  <VersionCard
                    key={v.id}
                    version={v}
                    isActive={selectedVersion?.id === v.id}
                    isFavourite={false}
                    onClick={handleSelectVersion}
                    onToggleFavourite={handleToggleFavourite}
                    {...(healthDotMap[v.id] ? { healthDot: healthDotMap[v.id] } : {})}
                    qaApproved={qaApprovedSet.has(v.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {releasedVersions.length > 0 && (
            <div className="mb-1">
              <button
                onClick={() => setShowReleased((s) => !s)}
                className="flex w-full items-center justify-between rounded-md px-2 py-1 transition-colors hover:bg-slate-200/60 dark:hover:bg-slate-700/50"
              >
                <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  <CheckCircle className="h-3 w-3" />
                  Released
                  <span className="ml-0.5 rounded-full bg-slate-200 px-1.5 py-0.5 font-semibold text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                    {releasedVersions.length}
                  </span>
                </span>
                <ChevronDown
                  className={cn(
                    "h-3 w-3 text-slate-400 transition-transform duration-150",
                    showReleased && "rotate-180",
                  )}
                />
              </button>
              {showReleased && (
                <div className="mt-1 space-y-1">
                  {releasedVersions.map((v) => (
                    <VersionCard
                      key={v.id}
                      version={v}
                      isActive={selectedVersion?.id === v.id}
                      isFavourite={false}
                      onClick={handleSelectVersion}
                      onToggleFavourite={handleToggleFavourite}
                      {...(healthDotMap[v.id] ? { healthDot: healthDotMap[v.id] } : {})}
                      qaApproved={qaApprovedSet.has(v.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {archivedVersions.length > 0 && (
            <div className="mb-1">
              <SectionLabel label="Archived" count={archivedVersions.length} accent="slate" muted />
              <div className="mt-1 space-y-1">
                {archivedVersions.map((v) => (
                  <VersionCard
                    key={v.id}
                    version={v}
                    isActive={selectedVersion?.id === v.id}
                    isFavourite={false}
                    onClick={handleSelectVersion}
                    onToggleFavourite={handleToggleFavourite}
                    {...(healthDotMap[v.id] ? { healthDot: healthDotMap[v.id] } : {})}
                    qaApproved={qaApprovedSet.has(v.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="mb-4 flex shrink-0 items-center gap-1 border-b border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setActiveTab("report")}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-3 pb-2.5 text-xs font-medium transition-colors",
              activeTab === "report"
                ? "border-indigo-500 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200",
            )}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Report
          </button>
          <button
            onClick={() => setActiveTab("feedback")}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-3 pb-2.5 text-xs font-medium transition-colors",
              activeTab === "feedback"
                ? "border-indigo-500 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200",
            )}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Feedback
          </button>
          <button
            onClick={() => setActiveTab("manage")}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-3 pb-2.5 text-xs font-medium transition-colors",
              activeTab === "manage"
                ? "border-indigo-500 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200",
            )}
          >
            <Layers className="h-3.5 w-3.5" />
            Manage Versions
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* FeedbackPanel stays mounted (CSS hidden) to avoid remount lag on tab switch */}
          {selectedVersion && (
            <div className={activeTab !== "feedback" ? "hidden" : ""}>
              <FeedbackPanel key={selectedVersion.id} version={selectedVersion} projectKey={executionProjectKey ?? ""} allVersions={allVersions} />
            </div>
          )}
          {!selectedVersion && activeTab === "feedback" && (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-slate-400 dark:text-slate-500">
              <MessageSquare className="h-8 w-8 opacity-40" />
              <p className="text-sm">Select a version to view or edit its feedback.</p>
            </div>
          )}
          {activeTab === "report" && (selectedGroup ? (
            <GroupReportPanel
              group={selectedGroup}
              projectKey={executionProjectKey}
              versions={allVersions}
              onSelectExecution={setSelectedExecution}
              onReload={handleReload}
              isRefreshing={isRefreshing}
              onHealthUpdate={handleHealthUpdate}
            />
          ) : !selectedVersion ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-slate-400 dark:text-slate-500">
              <Tag className="h-8 w-8 opacity-40" />
              <p className="text-sm">Select a version or group to view its report.</p>
            </div>
          ) : (
            <ExecutionListPanel
              projectKey={executionProjectKey}
              version={selectedVersion}
              onSelectExecution={setSelectedExecution}
              onReload={handleReload}
              isRefreshing={isRefreshing}
              onHealthUpdate={handleHealthUpdate}
              onApprovalUpdate={handleApprovalUpdate}
            />
          ))}
          {activeTab === "manage" && (
            <ManageVersionsTab
              projectKey={executionProjectKey}
              versions={allVersions}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default VersionsPage;
