/**
 * Modal that shows combined Jira issue details + Xray test-specific info
 * (test type, manual steps, Gherkin scenario) for a test issue.
 */
import { X, Loader2, FileText, FlaskConical } from "lucide-react";
import { useIssueDetail, useTestDetail } from "@/services/queries";
import { cn } from "@/components/ui/utils";
import { priorityClass } from "./utils";
import type { XrayTestStepDefinition } from "@/types";

// ── StepsTable ─────────────────────────────────────────────────────────────────

function StepsTable({ steps }: { steps: XrayTestStepDefinition[] }) {
  const hasData = steps.some((s) => s.data);
  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr className="border-b border-slate-200 dark:border-slate-700">
          <th className="w-8 py-1.5 pr-3 text-left font-semibold text-slate-400">#</th>
          <th className="py-1.5 pr-3 text-left font-semibold text-slate-400">Action</th>
          {hasData && (
            <th className="py-1.5 pr-3 text-left font-semibold text-slate-400">Test Data</th>
          )}
          <th className="py-1.5 text-left font-semibold text-slate-400">Expected Result</th>
        </tr>
      </thead>
      <tbody>
        {steps.map((step, i) => (
          <tr
            key={step.id ?? i}
            className="border-b border-slate-100 last:border-0 dark:border-slate-800"
          >
            <td className="py-2 pr-3 font-mono text-slate-400">{i + 1}</td>
            <td className="py-2 pr-3 text-slate-700 dark:text-slate-200">
              {step.action ?? <span className="italic text-slate-400">—</span>}
            </td>
            {hasData && (
              <td className="py-2 pr-3 font-mono text-slate-500 dark:text-slate-400">
                {step.data ?? "—"}
              </td>
            )}
            <td className="py-2 text-slate-600 dark:text-slate-300">
              {step.result ?? <span className="italic text-slate-400">—</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── TestDetailModal ────────────────────────────────────────────────────────────

interface TestDetailModalProps {
  testKey: string;
  projectKey: string;
  versionName: string;
  onClose: () => void;
}

export function TestDetailModal({
  testKey,
  projectKey: _projectKey,
  versionName: _versionName,
  onClose,
}: TestDetailModalProps) {
  const { data: jiraDetail, isLoading: jiraLoading } = useIssueDetail(testKey);
  const { data: xrayDetail, isLoading: xrayLoading } = useTestDetail(testKey);

  const isLoading = jiraLoading || xrayLoading;
  const testTypeName = xrayDetail?.test_type?.name;
  const isCucumber =
    testTypeName?.toLowerCase().includes("cucumber") ||
    testTypeName?.toLowerCase().includes("gherkin");
  const isGeneric =
    testTypeName?.toLowerCase().includes("generic") ||
    testTypeName?.toLowerCase().includes("unstructured");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-700">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-900/30">
              <FlaskConical className="h-4 w-4 text-amber-500 dark:text-amber-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {isLoading ? "Loading…" : jiraDetail?.summary ?? testKey}
              </h2>
              <div className="flex items-center gap-2">
                <p className="font-mono text-xs text-slate-400">{testKey}</p>
                {testTypeName && (
                  <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    {testTypeName}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading test details…
            </div>
          )}

          {!isLoading && (
            <div className="space-y-5">
              {/* Jira metadata */}
              {jiraDetail && (
                <div className="flex flex-wrap gap-2">
                  {jiraDetail.status && (
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {jiraDetail.status}
                    </span>
                  )}
                  {jiraDetail.priority && (
                    <span
                      className={cn(
                        "rounded px-2 py-0.5 text-xs font-medium",
                        priorityClass(jiraDetail.priority),
                      )}
                    >
                      {jiraDetail.priority}
                    </span>
                  )}
                  {jiraDetail.assignee && (
                    <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {jiraDetail.assignee}
                    </span>
                  )}
                </div>
              )}

              {/* Description */}
              {jiraDetail && jiraDetail.description_blocks.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Description
                  </p>
                  <div className="space-y-1.5 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800">
                    {jiraDetail.description_blocks
                      .filter((b) => b.type === "text")
                      .map((b, i) => (
                        <p
                          key={i}
                          className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300"
                        >
                          {b.type === "text" ? b.content : null}
                        </p>
                      ))}
                  </div>
                </div>
              )}

              {/* Manual steps */}
              {!isCucumber && !isGeneric && xrayDetail?.steps && xrayDetail.steps.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Test Steps ({xrayDetail.steps.length})
                  </p>
                  <div className="overflow-x-auto rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                    <StepsTable steps={xrayDetail.steps} />
                  </div>
                </div>
              )}

              {/* Gherkin */}
              {isCucumber && xrayDetail?.gherkin && (
                <div>
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    <FileText className="h-3 w-3" />
                    Gherkin Scenario
                  </p>
                  <pre className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {xrayDetail.gherkin}
                  </pre>
                </div>
              )}

              {/* Generic / unstructured */}
              {isGeneric && xrayDetail?.unstructured && (
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Test Definition
                  </p>
                  <pre className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {xrayDetail.unstructured}
                  </pre>
                </div>
              )}

              {/* No Xray-specific content */}
              {xrayDetail &&
                !xrayDetail.steps?.length &&
                !xrayDetail.gherkin &&
                !xrayDetail.unstructured && (
                  <p className="text-sm italic text-slate-400">
                    No test steps defined in Xray.
                  </p>
                )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
