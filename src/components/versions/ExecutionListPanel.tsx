import { RefreshCw } from "lucide-react";
import { useTestExecutionsByVersion } from "@/services/queries";
import { parseRateLimitError } from "@/stores/uiStore";
import { cn } from "@/components/ui/utils";
import { VersionContent } from "./VersionContent";
import type { JiraVersion, TestExecution } from "@/types";

interface ExecutionListPanelProps {
  projectKey: string;
  version: JiraVersion;
  onSelectExecution: (exec: TestExecution) => void;
  onReload: () => void;
  isRefreshing: boolean;
  onHealthUpdate: (versionId: string, dot: "green" | "amber" | "red") => void;
  onApprovalUpdate: (versionId: string, approved: boolean) => void;
}

export function ExecutionListPanel({
  projectKey,
  version,
  onSelectExecution,
  onReload,
  isRefreshing,
  onHealthUpdate,
  onApprovalUpdate,
}: ExecutionListPanelProps) {
  const {
    data: executions,
    isLoading: executionsLoading,
    isError,
    error,
  } = useTestExecutionsByVersion(projectKey, version.name);

  // Show a non-blocking error banner but still render content for other sections.
  const errorBanner = isError ? (() => {
    const rateLimitUntil = parseRateLimitError(error);
    if (rateLimitUntil !== null) {
      const seconds = Math.max(0, Math.ceil((rateLimitUntil - Date.now()) / 1_000));
      return (
        <div className="mb-3 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
          <p className="font-medium">Rate limited by Xray</p>
          <p className="mt-0.5 text-xs">
            Too many requests. Please wait{seconds > 0 ? ` ~${seconds}s` : ""} and try again.
          </p>
        </div>
      );
    }
    return (
      <div className="mb-3 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
        <p className="mb-1 font-medium">Failed to load test executions</p>
        <pre className="whitespace-pre-wrap break-words font-mono text-xs">{String(error)}</pre>
      </div>
    );
  })() : null;

  return (
    <div className="space-y-4">
      {errorBanner}
      <div className="flex items-center justify-end">
        <button
          onClick={onReload}
          disabled={isRefreshing}
          title="Reload version data"
          className={cn(
            "flex items-center gap-1.5 rounded px-2 py-1 text-xs text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40 dark:hover:bg-slate-700 dark:text-slate-400",
          )}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
          Reload
        </button>
      </div>
      <VersionContent
        projectKey={projectKey}
        executions={executions ?? []}
        executionsLoading={executionsLoading}
        version={version}
        onSelectExecution={onSelectExecution}
        onHealthUpdate={onHealthUpdate}
        onApprovalUpdate={onApprovalUpdate}
      />
    </div>
  );
}
