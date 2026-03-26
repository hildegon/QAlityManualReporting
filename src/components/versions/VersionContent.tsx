import { useEffect, useState } from "react";
import { Download, FileText } from "lucide-react";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { useBugsByVersion, useVersionIssues, useVersionRunStats } from "@/services/queries";
import { VersionKpiStrip } from "./KpiStrip";
import { ReleaseReadinessChecklist } from "./ReleaseReadinessChecklist";
import { VersionDashboard } from "./VersionDashboard";
import { BugsPanel } from "./BugsPanel";
import { VersionIssuesPanel } from "./VersionIssuesPanel";
import { ExecutionRow } from "./ExecutionRow";
import { buildVersionReportHTML } from "./htmlVersionReportBuilder";
import * as api from "@/services/tauri";
import type { JiraVersion, TestExecution } from "@/types";

interface VersionContentProps {
  projectKey: string;
  executions: TestExecution[];
  version: JiraVersion;
  onSelectExecution: (exec: TestExecution) => void;
  onHealthUpdate: (versionId: string, dot: "green" | "amber" | "red") => void;
}

export function VersionContent({
  projectKey,
  executions,
  version,
  onSelectExecution,
  onHealthUpdate,
}: VersionContentProps) {
  const {
    data: bugs,
    isLoading: bugsLoading,
    isError: bugsError,
    error: bugsErr,
  } = useBugsByVersion(projectKey, version.name);
  const { data: versionIssues } = useVersionIssues(projectKey, version.name);
  const stats = useVersionRunStats(executions, bugs);

  const [isExporting, setIsExporting] = useState(false);

  const allLoaded = stats.pagesLoaded >= stats.pagesExpected && stats.pagesExpected > 0;

  const handleExportPDF = async () => {
    const path = await saveDialog({
      title: "Save version report",
      defaultPath: `version-report-${version.name.replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.html`,
      filters: [{ name: "HTML Report", extensions: ["html"] }],
    });
    if (!path) return;
    setIsExporting(true);
    try {
      const html = buildVersionReportHTML({
        version,
        projectKey,
        stats,
        bugs: bugs ?? [],
        versionIssues: versionIssues ?? [],
        executions,
      });
      await api.writeTextFile(path, html);
      await openPath(path);
    } finally {
      setIsExporting(false);
    }
  };
  useEffect(() => {
    if (!allLoaded || stats.total === 0) return;
    const failCount =
      (stats.counts["FAIL"] ?? stats.counts["FAILED"] ?? 0) + (stats.counts["BLOCKED"] ?? 0);
    const passCount = stats.counts["PASS"] ?? stats.counts["PASSED"] ?? 0;
    const passRate = passCount / stats.total;
    const dot: "green" | "amber" | "red" =
      failCount === 0 ? "green" : passRate >= 0.8 ? "amber" : "red";
    onHealthUpdate(version.id, dot);
  }, [allLoaded, stats.counts, stats.total, version.id, onHealthUpdate]);

  return (
    <>
      {/* Export button — always visible once version card is expanded */}
      <div className="mb-3 flex justify-end">
        <button
          onClick={() => void handleExportPDF()}
          disabled={isExporting}
          title="Export version report — opens in browser for printing to PDF"
          className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40 dark:hover:bg-slate-700 dark:text-slate-400"
        >
          {isExporting ? (
            <Download className="h-3.5 w-3.5 animate-pulse" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          Export PDF
        </button>
      </div>

      {executions.length > 0 && (
        <div className="mb-4 space-y-3">
          <VersionKpiStrip
            stats={stats}
            executions={executions}
            bugs={bugs ?? []}
            versionIssues={versionIssues ?? []}
          />
          <ReleaseReadinessChecklist
            stats={stats}
            executions={executions}
            bugs={bugs ?? []}
            versionIssues={versionIssues ?? []}
            version={version}
          />
        </div>
      )}

      <VersionDashboard
        stats={stats}
        executions={executions}
        version={version}
        projectKey={projectKey}
        bugs={bugs ?? []}
      />

      <BugsPanel
        bugs={bugs}
        isLoading={bugsLoading}
        isError={bugsError}
        error={bugsErr}
        failedTests={stats.failedTests}
        version={version}
        projectKey={projectKey}
      />

      <div id="version-section-issues">
        <VersionIssuesPanel projectKey={projectKey} versionName={version.name} />
      </div>

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
