import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { statusVariant } from "@/components/ui/badge-utils";
import type { TestExecution } from "@/types";

interface ExecutionRowProps {
  execution: TestExecution;
  onClick: () => void;
}

export const ExecutionRow = memo(function ExecutionRow({ execution, onClick }: ExecutionRowProps) {
  const statusName = execution.jira.status?.name ?? "";
  return (
    <button
      onClick={onClick}
      className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600 dark:hover:bg-slate-700"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-sm text-slate-900 dark:text-slate-200">
            {execution.jira.summary}
          </p>
          <p className="mt-0.5 font-mono text-xs text-slate-400">{execution.jira.key}</p>
        </div>
        {statusName && (
          <Badge variant={statusVariant(statusName)} className="shrink-0">
            {statusName}
          </Badge>
        )}
      </div>
    </button>
  );
});
