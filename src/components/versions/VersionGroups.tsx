import { useEffect, useMemo } from "react";
import { Layers, Loader2, RefreshCw, FileText } from "lucide-react";
import { useQueries } from "@tanstack/react-query";
import * as api from "@/services/tauri";
import { queryKeys, useVersionRunStats } from "@/services/queries";
import { cn } from "@/components/ui/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { ReleaseReadinessChecklist } from "./ReleaseReadinessChecklist";
import { VersionDashboard } from "./VersionDashboard";
import { BugsPanel } from "./BugsPanel";
import { VersionIssuesPanel } from "./VersionIssuesPanel";
import { ExecutionRow } from "./ExecutionRow";
import type { VersionGroup } from "@/stores/versionsStore";
import type { JiraVersion, TestExecution } from "@/types";

// ── VersionGroupCard ───────────────────────────────────────────────────────────

interface VersionGroupCardProps {
  group: VersionGroup;
  versions: JiraVersion[];
  isActive: boolean;
  onClick: (id: string) => void;
}

export function VersionGroupCard({ group, versions, isActive, onClick }: VersionGroupCardProps) {
  const memberNames = group.versionIds
    .map((id) => versions.find((v) => v.id === id)?.name)
    .filter(Boolean) as string[];

  return (
    <button
      onClick={() => onClick(group.id)}
      className={cn(
        "w-full rounded-lg border px-3 py-2 text-left transition-all text-xs",
        isActive
          ? "border-violet-400 bg-violet-50 shadow-sm dark:border-violet-500 dark:bg-violet-900/30"
          : "border-transparent hover:border-violet-200 hover:bg-violet-50/60 dark:hover:border-violet-700/60 dark:hover:bg-violet-900/20",
      )}
    >
      <div className="flex items-center gap-1.5">
        <Layers className="h-3 w-3 shrink-0 text-violet-500" />
        <span className="font-medium text-slate-800 dark:text-slate-100">{group.name}</span>
        <span className="ml-auto shrink-0 text-[10px] text-slate-400">
          {memberNames.length}v
        </span>
      </div>
      {memberNames.length > 0 && (
        <p className="mt-0.5 truncate text-[10px] text-slate-400 dark:text-slate-500">
          {memberNames.join(" · ")}
        </p>
      )}
    </button>
  );
}

// ── GroupVersionContent ────────────────────────────────────────────────────────

function GroupVersionContent({
  group,
  projectKey,
  versions,
  executions,
  onSelectExecution,
  onHealthUpdate,
}: {
  group: VersionGroup;
  projectKey: string;
  versions: JiraVersion[];
  executions: TestExecution[];
  onSelectExecution: (exec: TestExecution) => void;
  onHealthUpdate: (id: string, dot: "green" | "amber" | "red") => void;
}) {
  const bugResults = useQueries({
    queries: versions.map((v) => ({
      queryKey: queryKeys.bugsByVersion(projectKey, v.name),
      queryFn: () => api.getBugsByVersion(projectKey, v.name),
      staleTime: 2 * 60 * 1_000,
      gcTime: Infinity,
    })),
  });

  const issueResults = useQueries({
    queries: versions.map((v) => ({
      queryKey: queryKeys.versionIssues(projectKey, v.name),
      queryFn: () => api.getVersionIssues(projectKey, v.name),
      staleTime: 2 * 60 * 1_000,
      gcTime: Infinity,
    })),
  });

  const bugs = useMemo(() => {
    const seen = new Set<string>();
    return bugResults.flatMap((r) => r.data ?? []).filter((b) => {
      if (seen.has(b.id)) return false;
      seen.add(b.id);
      return true;
    });
  }, [bugResults]);

  const versionIssues = useMemo(() => {
    const seen = new Set<string>();
    return issueResults.flatMap((r) => r.data ?? []).filter((i) => {
      if (seen.has(i.id)) return false;
      seen.add(i.id);
      return true;
    });
  }, [issueResults]);

  const stats = useVersionRunStats(executions, bugs);

  const syntheticVersion = useMemo<JiraVersion>(
    () => ({
      id: `group:${group.id}`,
      name: group.name,
      description: `${versions.length} version${versions.length !== 1 ? "s" : ""}: ${versions.map((v) => v.name).join(", ")}`,
    }),
    [group, versions],
  );

  const allLoaded = stats.pagesLoaded >= stats.pagesExpected && stats.pagesExpected > 0;
  useEffect(() => {
    if (!allLoaded || stats.total === 0) return;
    const failCount =
      (stats.counts["FAIL"] ?? stats.counts["FAILED"] ?? 0) + (stats.counts["BLOCKED"] ?? 0);
    const passCount = stats.counts["PASS"] ?? stats.counts["PASSED"] ?? 0;
    const dot: "green" | "amber" | "red" =
      failCount === 0 ? "green" : passCount / stats.total >= 0.8 ? "amber" : "red";
    onHealthUpdate(`group:${group.id}`, dot);
  }, [allLoaded, stats.counts, stats.total, group.id, onHealthUpdate]);

  const bugsLoading = bugResults.some((r) => r.isLoading);
  const bugsError = bugResults.some((r) => r.isError);
  const bugsErr = bugResults.find((r) => r.isError)?.error;

  return (
    <>
      {executions.length > 0 && (
        <div className="mb-4 space-y-3">
          <ReleaseReadinessChecklist
            stats={stats}
            executions={executions}
            bugs={bugs}
            versionIssues={versionIssues}
            version={syntheticVersion}
          />
        </div>
      )}

      <VersionDashboard
        stats={stats}
        executions={executions}
        version={syntheticVersion}
        projectKey={projectKey}
        bugs={bugs}
      />

      <BugsPanel
        bugs={bugs}
        isLoading={bugsLoading}
        isError={bugsError}
        error={bugsErr}
        failedTests={stats.failedTests}
        version={null}
        projectKey={projectKey}
      />

      {versions.map((v) => (
        <div key={v.id} className="mt-4">
          <VersionIssuesPanel projectKey={projectKey} versionName={v.name} />
        </div>
      ))}

      {executions.length > 0 && (
        <div id="version-section-executions" className="mt-4">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <FileText className="h-3.5 w-3.5" />
            Executions
          </div>
          <div className="space-y-2">
            {executions.map((exec) => (
              <ExecutionRow
                key={exec.issue_id}
                execution={exec}
                onClick={() => onSelectExecution(exec)}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ── GroupReportPanel ───────────────────────────────────────────────────────────

interface GroupReportPanelProps {
  group: VersionGroup;
  projectKey: string;
  versions: JiraVersion[];
  onSelectExecution: (exec: TestExecution) => void;
  onReload: () => void;
  isRefreshing: boolean;
  onHealthUpdate: (id: string, dot: "green" | "amber" | "red") => void;
}

export function GroupReportPanel({
  group,
  projectKey,
  versions,
  onSelectExecution,
  onReload,
  isRefreshing,
  onHealthUpdate,
}: GroupReportPanelProps) {
  const groupVersions = useMemo(
    () => versions.filter((v) => group.versionIds.includes(v.id)),
    [versions, group.versionIds],
  );

  const execResults = useQueries({
    queries: groupVersions.map((v) => ({
      queryKey: queryKeys.testExecutionsByVersion(projectKey, v.name),
      queryFn: () => api.getTestExecutionsByVersion(projectKey, v.name),
      staleTime: 2 * 60 * 1_000,
      gcTime: Infinity,
    })),
  });

  const isLoading = execResults.some((r) => r.isLoading);

  const executions = useMemo(() => {
    const seen = new Set<string>();
    return execResults.flatMap((r) => r.data ?? []).filter((e) => {
      if (seen.has(e.issue_id)) return false;
      seen.add(e.issue_id);
      return true;
    });
  }, [execResults]);

  if (groupVersions.length === 0) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-2 text-slate-400 dark:text-slate-500">
        <Layers className="h-8 w-8 opacity-40" />
        <p className="text-sm">This group has no versions yet.</p>
        <p className="text-xs">Add versions in the Manage Versions tab.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2 p-2">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading executions…</span>
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded border border-slate-100 px-3 py-2 dark:border-slate-700"
          >
            <Skeleton className="h-4 w-20 shrink-0" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-1">
          {groupVersions.map((v) => (
            <span
              key={v.id}
              className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
            >
              {v.name}
            </span>
          ))}
        </div>
        <button
          onClick={onReload}
          disabled={isRefreshing}
          title="Reload group data"
          className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40 dark:hover:bg-slate-700"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
          Reload
        </button>
      </div>
      <GroupVersionContent
        group={group}
        projectKey={projectKey}
        versions={groupVersions}
        executions={executions}
        onSelectExecution={onSelectExecution}
        onHealthUpdate={onHealthUpdate}
      />
    </div>
  );
}
