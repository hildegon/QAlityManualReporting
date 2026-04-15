import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Download, FileText } from "lucide-react";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { useBugsByVersion, useVersionIssues, useVersionRunStats, useVersionRelatedWork, useConfluencePage } from "@/services/queries";
import { cn } from "@/components/ui/utils";
import { ReleaseReadinessChecklist } from "./ReleaseReadinessChecklist";
import { VersionDashboard } from "./VersionDashboard";
import { BugsPanel } from "./BugsPanel";
import { VersionIssuesPanel } from "./VersionIssuesPanel";
import { ExecutionRow } from "./ExecutionRow";
import { FeedbackSummary } from "./FeedbackSummary";
import { RELATED_WORK_TITLE_PREFIX, parseIssueRows } from "./FeedbackPanel";
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

  // Feedback data (mirrors FeedbackSummary pipeline)
  const { data: relatedWork } = useVersionRelatedWork(version.id);
  const feedbackEntry = useMemo(
    () => relatedWork?.find((rw) => rw.title?.startsWith(RELATED_WORK_TITLE_PREFIX)),
    [relatedWork],
  );
  const feedbackPageId = useMemo(() => {
    if (!feedbackEntry?.url) return undefined;
    return feedbackEntry.url.match(/\/pages\/(\d+)/)?.[1];
  }, [feedbackEntry?.url]);
  const { data: feedbackPage } = useConfluencePage(feedbackPageId);
  const feedbackRows = useMemo(
    () => parseIssueRows(feedbackPage?.body_storage ?? ""),
    [feedbackPage?.body_storage],
  );

  const [isExporting, setIsExporting] = useState(false);
  const [execsOpen, setExecsOpen] = useState(false);

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
      const feedbackData = feedbackRows.length > 0
        ? { rows: feedbackRows, ...(feedbackEntry?.url ? { confluenceUrl: feedbackEntry.url } : {}) }
        : undefined;
      const reportParams: Parameters<typeof buildVersionReportHTML>[0] = {
        version,
        projectKey,
        stats,
        bugs: bugs ?? [],
        versionIssues: versionIssues ?? [],
        executions,
      };
      if (feedbackData) reportParams.feedback = feedbackData;
      const html = buildVersionReportHTML(reportParams);
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

      <div id="version-section-feedback">
        <FeedbackSummary version={version} />
      </div>

      {executions.length > 0 && (
        <div className="mb-4 space-y-3">
          <ReleaseReadinessChecklist
            stats={stats}
            executions={executions}
            bugs={bugs ?? []}
            versionIssues={versionIssues ?? []}
            version={version}
            feedbackRows={feedbackRows}
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
        <div id="version-section-executions" className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <button
            onClick={() => setExecsOpen((o) => !o)}
            className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50"
          >
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <FileText className="h-3.5 w-3.5" />
              Executions ({executions.length})
            </span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 text-slate-400 transition-transform",
                execsOpen && "rotate-180",
              )}
            />
          </button>
          {execsOpen && (
            <div className="space-y-2 border-t border-slate-100 p-3 dark:border-slate-700">
              {executions.map((exec) => (
                <ExecutionRow
                  key={exec.issue_id}
                  execution={exec}
                  onClick={() => onSelectExecution(exec)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
