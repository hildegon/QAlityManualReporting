/**
 * Full-screen modal for viewing a test's last execution results from the Coverage page.
 * Shows Jira metadata, test definition (steps/gherkin), last run step-by-step results,
 * defect links, and a "Create Bug" action that auto-links the new bug as an Xray defect.
 *
 * Failed tests receive special treatment: the executor comment is elevated into a
 * prominent callout, failed steps are highlighted with a red border/tint, and per-step
 * comments, actual results, and defect links are shown inline so the reviewer can
 * quickly understand *why* the test failed without clicking through to Xray.
 */
import { useState, useMemo } from "react";
import {
  X,
  Loader2,
  FlaskConical,
  FileText,
  Bug,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  AlertCircle,
  MessageSquare,
  User,
  Clock,
  Image,
  Play,
  AlertTriangle,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { cn } from "@/components/ui/utils";
import {
  useIssueDetail,
  useTestDetail,
  useTestRunsByTestId,
  useAddDefectsToTestRun,
  useUserDisplayName,
  useConfig,
  useXrayEvidence,
} from "@/services/queries";
import { StatusBadge } from "./StatusBadge";
import { CreateBugModal } from "@/components/bugs/CreateBugModal";
import { AttachmentPreview } from "@/components/versions/IssueDetailModal";
import type {
  TestRun,
  TestRunStep,
  TestRunIteration,
  XrayTestStepDefinition,
  DescriptionBlock,
  CucumberResult,
  CucumberResultsStep,
  Evidence,
} from "@/types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isFail(name?: string): boolean {
  const n = name?.toUpperCase() ?? "";
  return n === "FAIL" || n === "FAILED";
}

function isPass(name?: string): boolean {
  const n = name?.toUpperCase() ?? "";
  return n === "PASS" || n === "PASSED";
}

function stepStatusColor(name?: string): string {
  const n = name?.toUpperCase() ?? "";
  if (isPass(n))
    return "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-900/30";
  if (isFail(n))
    return "text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/30";
  if (n === "EXECUTING")
    return "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/30";
  return "text-slate-500 bg-slate-100 dark:text-slate-400 dark:bg-slate-700";
}

// ── Inline user-name resolver ────────────────────────────────────────────────

function UserName({ accountId }: { accountId: string }) {
  const { data: name } = useUserDisplayName(accountId);
  return <>{name ?? accountId}</>;
}

// ── Defect chip with title + clickable link ──────────────────────────────────

function DefectChip({ issueKey, jiraUrl }: { issueKey: string; jiraUrl?: string }) {
  const { data: detail } = useIssueDetail(issueKey);
  const href = jiraUrl ? `${jiraUrl.replace(/\/+$/, "")}/browse/${issueKey}` : null;

  const content = (
    <>
      <Bug className="h-2.5 w-2.5 shrink-0" />
      <span>{issueKey}</span>
      {detail?.summary && (
        <span className="truncate font-normal text-red-500 dark:text-red-300">
          — {detail.summary}
        </span>
      )}
      {href && <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-50" />}
    </>
  );

  const className =
    "inline-flex max-w-xs items-center gap-1 rounded border border-red-200 bg-red-50 " +
    "px-2 py-0.5 font-mono text-[10px] font-semibold text-red-600 " +
    "dark:border-red-800 dark:bg-red-900/30 dark:text-red-400";

  if (href) {
    return (
      <button
        className={cn(className, "cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/50")}
        title={`Open ${issueKey} in Jira`}
        onClick={() => void openUrl(href)}
      >
        {content}
      </button>
    );
  }
  return <span className={className}>{content}</span>;
}

// ── Step results table (with failure highlighting) ───────────────────────────

function StepResultsTable({
  steps,
  jiraUrl,
}: {
  steps: TestRunStep[];
  jiraUrl?: string;
}) {
  return (
    <div className="divide-y divide-slate-100 dark:divide-slate-800">
      {steps.map((step, i) => {
        const failed = isFail(step.status?.name);
        const hasDetail = step.actual_result || step.comment || (step.defects && step.defects.length > 0) || (step.evidence && step.evidence.length > 0);

        return (
          <div
            key={step.id ?? i}
            className={cn(
              "py-2.5 px-3 transition-colors",
              failed
                ? "border-l-3 border-l-red-400 bg-red-50/60 dark:border-l-red-500 dark:bg-red-950/20"
                : "border-l-3 border-l-transparent",
            )}
          >
            {/* Main row: step #, action, expected, status */}
            <div className="flex items-start gap-3">
              <span className="mt-0.5 w-5 shrink-0 text-right font-mono text-[11px] text-slate-400">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="text-xs text-slate-700 dark:text-slate-200">
                      {step.action ?? (
                        <span className="italic text-slate-400">—</span>
                      )}
                    </p>
                    {step.result && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="font-semibold text-slate-400">Expected: </span>
                        {step.result}
                      </p>
                    )}
                  </div>
                  {step.status?.name ? (
                    <span
                      className={cn(
                        "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold",
                        stepStatusColor(step.status.name),
                      )}
                    >
                      {step.status.name}
                    </span>
                  ) : (
                    <span className="mt-0.5 shrink-0 text-[10px] text-slate-400">—</span>
                  )}
                </div>

                {/* Expanded detail for failed / annotated steps */}
                {hasDetail && (
                  <div className="mt-1.5 space-y-1 pl-0.5">
                    {step.actual_result && (
                      <div
                        className={cn(
                          "rounded px-2 py-1 text-[11px]",
                          failed
                            ? "border border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
                            : "border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
                        )}
                      >
                        <span className="font-semibold">Actual: </span>
                        {step.actual_result}
                      </div>
                    )}
                    {step.comment && (
                      <div className="flex items-start gap-1.5 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                        <MessageSquare className="mt-0.5 h-3 w-3 shrink-0" />
                        <span className="whitespace-pre-wrap">{step.comment}</span>
                      </div>
                    )}
                    {step.defects && step.defects.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {step.defects.map((key) => (
                          <DefectChip key={key} issueKey={key} {...(jiraUrl ? { jiraUrl } : {})} />
                        ))}
                      </div>
                    )}
                    {step.evidence && step.evidence.length > 0 && (
                      <EvidenceGallery evidence={step.evidence} />
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Test definition steps table (no results) ─────────────────────────────────

function DefinitionStepsTable({ steps }: { steps: XrayTestStepDefinition[] }) {
  const hasData = steps.some((s) => s.data);
  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr className="border-b border-slate-200 dark:border-slate-700">
          <th className="w-8 py-1.5 pr-2 text-left font-semibold text-slate-400">#</th>
          <th className="py-1.5 pr-2 text-left font-semibold text-slate-400">Action</th>
          {hasData && (
            <th className="py-1.5 pr-2 text-left font-semibold text-slate-400">Test Data</th>
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
            <td className="py-2 pr-2 font-mono text-slate-400">{i + 1}</td>
            <td className="py-2 pr-2 text-slate-700 dark:text-slate-200">
              {step.action ?? <span className="italic text-slate-400">—</span>}
            </td>
            {hasData && (
              <td className="py-2 pr-2 font-mono text-slate-500 dark:text-slate-400">
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

// ── Collapsible section ──────────────────────────────────────────────────────

function Section({
  title,
  defaultOpen = false,
  children,
  badge,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  badge?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        className="flex w-full items-center gap-2 py-2 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        )}
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          {title}
        </span>
        {badge}
      </button>
      {open && <div className="pb-2">{children}</div>}
    </div>
  );
}

// ── Executor comment callout ─────────────────────────────────────────────────

function ExecutorComment({ comment, failed }: { comment: string; failed: boolean }) {
  return (
    <div
      className={cn(
        "rounded-lg border px-4 py-3",
        failed
          ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30"
          : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800",
      )}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <MessageSquare
          className={cn(
            "h-3.5 w-3.5",
            failed ? "text-red-500 dark:text-red-400" : "text-slate-400",
          )}
        />
        <span
          className={cn(
            "text-[10px] font-bold uppercase tracking-wider",
            failed ? "text-red-600 dark:text-red-400" : "text-slate-400",
          )}
        >
          Executor Comment
        </span>
      </div>
      <p
        className={cn(
          "whitespace-pre-wrap text-sm leading-relaxed",
          failed
            ? "text-red-800 dark:text-red-200"
            : "text-slate-700 dark:text-slate-300",
        )}
      >
        {comment}
      </p>
    </div>
  );
}

// ── Failed steps summary banner ──────────────────────────────────────────────

function FailedStepsSummary({ steps }: { steps: TestRunStep[] }) {
  const failedSteps = steps
    .map((s, i) => ({ ...s, index: i + 1 }))
    .filter((s) => isFail(s.status?.name));

  if (failedSteps.length === 0) return null;

  return (
    <div className="rounded-lg border border-red-200 bg-red-50/70 px-4 py-3 dark:border-red-800 dark:bg-red-950/20">
      <p className="mb-2 text-xs font-bold text-red-700 dark:text-red-300">
        {failedSteps.length} step{failedSteps.length > 1 ? "s" : ""} failed
      </p>
      <div className="space-y-1.5">
        {failedSteps.map((s) => (
          <div key={s.id ?? s.index} className="text-xs">
            <span className="font-mono font-bold text-red-600 dark:text-red-400">
              Step {s.index}:
            </span>{" "}
            <span className="text-red-700 dark:text-red-300">
              {s.action ?? "(no action)"}
            </span>
            {s.actual_result && (
              <p className="mt-0.5 pl-4 text-[11px] text-red-600 dark:text-red-400">
                <span className="font-semibold">Actual: </span>
                {s.actual_result}
              </p>
            )}
            {s.comment && (
              <p className="mt-0.5 flex items-start gap-1 pl-4 text-[11px] text-red-600 dark:text-red-400">
                <MessageSquare className="mt-0.5 h-2.5 w-2.5 shrink-0" />
                <span className="italic">{s.comment}</span>
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Iterations section ───────────────────────────────────────────────────────

function IterationsSection({ iterations }: { iterations: TestRunIteration[] }) {
  const [expandedRank, setExpandedRank] = useState<string | null>(null);

  return (
    <div className="space-y-1.5">
      {iterations.map((iter) => {
        const rank = iter.rank ?? "?";
        const iterFailed = isFail(iter.status?.name);
        const iterPassed = isPass(iter.status?.name);
        const isOpen = expandedRank === rank;
        const paramLabel = iter.parameters
          .map((p) => `${p.name}=${p.value ?? "?"}`)
          .join(", ");

        return (
          <div
            key={rank}
            className={cn(
              "rounded-lg border",
              iterFailed
                ? "border-red-200 dark:border-red-800"
                : iterPassed
                  ? "border-emerald-200 dark:border-emerald-800"
                  : "border-slate-200 dark:border-slate-700",
            )}
          >
            <button
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-left text-xs",
                iterFailed
                  ? "bg-red-50/60 dark:bg-red-950/20"
                  : iterPassed
                    ? "bg-emerald-50/60 dark:bg-emerald-950/20"
                    : "bg-slate-50/60 dark:bg-slate-800/60",
              )}
              onClick={() => setExpandedRank(isOpen ? null : rank)}
            >
              {isOpen ? (
                <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" />
              ) : (
                <ChevronRight className="h-3 w-3 shrink-0 text-slate-400" />
              )}
              <span className="font-mono font-bold text-slate-500">#{rank}</span>
              {iter.status?.name && (
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-bold",
                    stepStatusColor(iter.status.name),
                  )}
                >
                  {iter.status.name}
                </span>
              )}
              {paramLabel && (
                <span className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                  {paramLabel}
                </span>
              )}
            </button>
            {isOpen && iter.step_results && iter.step_results.results.length > 0 && (
              <div className="border-t border-slate-100 dark:border-slate-800">
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {iter.step_results.results.map((sr, idx) => {
                    const srFailed = isFail(sr.status?.name);
                    return (
                      <div
                        key={sr.id ?? idx}
                        className={cn(
                          "flex items-start gap-3 px-3 py-2",
                          srFailed
                            ? "border-l-3 border-l-red-400 bg-red-50/40 dark:border-l-red-500 dark:bg-red-950/10"
                            : "border-l-3 border-l-transparent",
                        )}
                      >
                        <span className="mt-0.5 w-4 shrink-0 text-right font-mono text-[10px] text-slate-400">
                          {idx + 1}
                        </span>
                        <div className="min-w-0 flex-1 space-y-0.5">
                          {sr.status?.name && (
                            <span
                              className={cn(
                                "inline-block rounded px-1.5 py-0.5 text-[10px] font-bold",
                                stepStatusColor(sr.status.name),
                              )}
                            >
                              {sr.status.name}
                            </span>
                          )}
                          {sr.actual_result && (
                            <p
                              className={cn(
                                "rounded px-2 py-0.5 text-[11px]",
                                srFailed
                                  ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                                  : "bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
                              )}
                            >
                              <span className="font-semibold">Actual: </span>
                              {sr.actual_result}
                            </p>
                          )}
                          {sr.comment && (
                            <p className="flex items-start gap-1 text-[11px] text-amber-700 dark:text-amber-300">
                              <MessageSquare className="mt-0.5 h-2.5 w-2.5 shrink-0" />
                              <span className="italic">{sr.comment}</span>
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Gherkin / Cucumber helpers ────────────────────────────────────────────────

const GHERKIN_KEYWORDS = /^(Given|When|Then|And|But|\*)\s+/i;

function gherkinKeywordStyle(keyword: string): string {
  const k = keyword.trim().toLowerCase();
  if (k === "given")
    return "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300";
  if (k === "when")
    return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300";
  if (k === "then")
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
  return "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400";
}

function formatDuration(seconds?: number): string {
  if (seconds == null) return "";
  if (seconds < 1) return `${Math.round(seconds * 1000)}ms`;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

// ── Proxied Xray image (fetched through Tauri with auth) ─────────────────────

function ProxiedXrayImage({
  downloadUrl,
  mimeType,
  alt,
  className,
  onClick,
}: {
  downloadUrl: string;
  mimeType: string;
  alt: string;
  className?: string | undefined;
  onClick?: () => void;
}) {
  const { data: dataUri, isLoading, isError } = useXrayEvidence(downloadUrl, mimeType);

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center bg-slate-50 dark:bg-slate-800", className)}>
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }
  if (isError || !dataUri) {
    return (
      <div className={cn("flex items-center justify-center bg-slate-50 dark:bg-slate-800", className)}>
        <FileText className="h-5 w-5 text-slate-400" />
      </div>
    );
  }
  return <img src={dataUri} alt={alt} className={className} onClick={onClick} />;
}

// ── Proxied evidence image (routes through Xray auth proxy) ──────────────────

function ProxiedEvidenceImage({
  evidence,
  className,
}: {
  evidence: Evidence;
  className?: string;
}) {
  const mimeType = evidence.filename?.match(/\.(png|gif|svg|webp|bmp)$/i)
    ? `image/${(evidence.filename.match(/\.(\w+)$/)?.[1] ?? "png").toLowerCase()}`
    : "image/jpeg";

  if (evidence.download_link) {
    return (
      <ProxiedXrayImage
        downloadUrl={evidence.download_link}
        mimeType={mimeType}
        alt={evidence.filename ?? "Evidence"}
        className={className}
      />
    );
  }

  return (
    <div className="flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
      <Image className="h-3 w-3" /> {evidence.filename}
    </div>
  );
}

// ── Inline embedding renderer (screenshots from Cucumber results) ────────────

function EmbeddingGallery({ embeddings }: { embeddings: CucumberResultsStep["embeddings"] }) {
  const imgs = (embeddings ?? []).filter(
    (e) => e.mime_type?.startsWith("image/") && (e.data || e.download_link),
  );
  if (imgs.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {imgs.map((emb, i) => {
        if (emb.data) {
          return (
            <div key={i} className="group relative">
              <img
                src={`data:${emb.mime_type};base64,${emb.data}`}
                alt={emb.filename ?? `Screenshot ${i + 1}`}
                className="max-h-48 max-w-xs rounded-lg border border-slate-200 object-contain shadow-sm dark:border-slate-700"
              />
              {emb.filename && (
                <span className="mt-0.5 block text-center text-[9px] text-slate-400 truncate max-w-xs">
                  {emb.filename}
                </span>
              )}
            </div>
          );
        }
        return (
          <div key={i} className="group relative">
            <ProxiedXrayImage
              downloadUrl={emb.download_link!}
              mimeType={emb.mime_type ?? "image/png"}
              alt={emb.filename ?? `Screenshot ${i + 1}`}
              className="max-h-48 max-w-xs rounded-lg border border-slate-200 object-contain shadow-sm dark:border-slate-700"
            />
            {emb.filename && (
              <span className="mt-0.5 block text-center text-[9px] text-slate-400 truncate max-w-xs">
                {emb.filename}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Evidence gallery (attached files on runs/steps) ──────────────────────────

function EvidenceGallery({
  evidence,
  label,
}: {
  evidence: Evidence[];
  label?: string;
}) {
  if (evidence.length === 0) return null;

  const images = evidence.filter((e) =>
    /\.(png|jpe?g|gif|svg|webp|bmp)$/i.test(e.filename ?? ""),
  );
  const others = evidence.filter(
    (e) => !/\.(png|jpe?g|gif|svg|webp|bmp)$/i.test(e.filename ?? ""),
  );

  return (
    <div className="mt-2">
      {label && (
        <p className="mb-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          <Image className="h-3 w-3" />
          {label}
        </p>
      )}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((ev) => (
            <div key={ev.id ?? ev.filename} className="group relative">
              <ProxiedEvidenceImage
                evidence={ev}
                className="max-h-48 max-w-xs rounded-lg border border-slate-200 object-contain shadow-sm dark:border-slate-700"
              />
              {ev.filename && (
                <span className="mt-0.5 block text-center text-[9px] text-slate-400 truncate max-w-xs">
                  {ev.filename}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {others.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {others.map((ev) => (
            <span
              key={ev.id ?? ev.filename}
              className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
            >
              <FileText className="h-2.5 w-2.5" />
              {ev.filename ?? "file"}
              {ev.size != null && (
                <span className="text-slate-400">
                  ({ev.size < 1024 ? `${ev.size}B` : `${Math.round(ev.size / 1024)}KB`})
                </span>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Cucumber step row ────────────────────────────────────────────────────────

function CucumberStepRow({
  step,
  index,
}: {
  step: CucumberResultsStep;
  index: number;
}) {
  const failed = isFail(step.status?.name);
  const passed = isPass(step.status?.name);
  const hasEmbeddings = (step.embeddings?.length ?? 0) > 0;

  return (
    <div
      className={cn(
        "px-3 py-2 transition-colors",
        failed
          ? "border-l-3 border-l-red-400 bg-red-50/40 dark:border-l-red-500 dark:bg-red-950/10"
          : passed
            ? "border-l-3 border-l-emerald-300 dark:border-l-emerald-600"
            : "border-l-3 border-l-transparent",
      )}
    >
      <div className="flex items-start gap-2">
        <span className="mt-1 w-4 shrink-0 text-right font-mono text-[10px] text-slate-400">
          {index + 1}
        </span>

        {step.keyword && (
          <span
            className={cn(
              "mt-0.5 shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold",
              gherkinKeywordStyle(step.keyword),
            )}
          >
            {step.keyword}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs text-slate-700 dark:text-slate-200">
              {step.name ?? <span className="italic text-slate-400">—</span>}
            </p>
            <div className="flex shrink-0 items-center gap-1.5">
              {step.duration != null && (
                <span className="text-[9px] text-slate-400">
                  {formatDuration(step.duration)}
                </span>
              )}
              {step.status?.name && (
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-bold",
                    stepStatusColor(step.status.name),
                  )}
                >
                  {step.status.name}
                </span>
              )}
            </div>
          </div>

          {step.error && (
            <div className="mt-1.5 rounded border border-red-200 bg-red-50 px-2.5 py-1.5 dark:border-red-800 dark:bg-red-950/40">
              <div className="mb-0.5 flex items-center gap-1 text-[10px] font-bold text-red-600 dark:text-red-400">
                <AlertTriangle className="h-3 w-3" />
                Error
              </div>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-red-700 dark:text-red-300">
                {step.error}
              </pre>
            </div>
          )}

          {step.log && (
            <pre className="mt-1 rounded bg-slate-100 px-2 py-1 font-mono text-[10px] text-slate-600 whitespace-pre-wrap break-words dark:bg-slate-800 dark:text-slate-400">
              {step.log}
            </pre>
          )}

          {hasEmbeddings && <EmbeddingGallery embeddings={step.embeddings} />}
        </div>
      </div>
    </div>
  );
}

// ── Cucumber failed steps summary banner ─────────────────────────────────────

function CucumberFailedStepsSummary({ results }: { results: CucumberResult[] }) {
  const failedScenarios = results
    .map((r, si) => {
      const allSteps = [
        ...(r.backgrounds ?? []),
        ...(r.steps ?? []),
        ...(r.hooks ?? []),
      ];
      const failedSteps = allSteps
        .map((s, i) => ({ ...s, stepIndex: i + 1 }))
        .filter((s) => isFail(s.status?.name));
      return { scenario: r, scenarioIndex: si + 1, failedSteps };
    })
    .filter((s) => s.failedSteps.length > 0);

  if (failedScenarios.length === 0) return null;

  const totalFailed = failedScenarios.reduce((n, s) => n + s.failedSteps.length, 0);

  return (
    <div className="rounded-lg border border-red-200 bg-red-50/70 px-4 py-3 dark:border-red-800 dark:bg-red-950/20">
      <p className="mb-2 text-xs font-bold text-red-700 dark:text-red-300">
        {totalFailed} step{totalFailed > 1 ? "s" : ""} failed across{" "}
        {failedScenarios.length} scenario{failedScenarios.length > 1 ? "s" : ""}
      </p>
      <div className="space-y-2">
        {failedScenarios.map(({ scenario, scenarioIndex, failedSteps }) => (
          <div key={scenarioIndex}>
            <p className="mb-1 text-[11px] font-semibold text-red-600 dark:text-red-400">
              {scenario.name ?? `Scenario #${scenarioIndex}`}
            </p>
            <div className="space-y-1.5 pl-2">
              {failedSteps.map((s) => (
                <div key={s.stepIndex} className="text-xs">
                  <span className="font-mono font-bold text-red-600 dark:text-red-400">
                    {s.keyword ? `${s.keyword.trim()} ` : `Step ${s.stepIndex}: `}
                  </span>
                  <span className="text-red-700 dark:text-red-300">
                    {s.name ?? "(no description)"}
                  </span>
                  {s.error && (
                    <p className="mt-0.5 pl-4 text-[11px] text-red-600 dark:text-red-400">
                      <span className="font-semibold">Error: </span>
                      <span className="whitespace-pre-wrap break-words">{s.error.split("\n")[0]}</span>
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Full Cucumber scenario panel ─────────────────────────────────────────────

function CucumberScenarioPanel({
  result,
  index,
  scenarioType,
}: {
  result: CucumberResult;
  index: number;
  scenarioType?: string;
}) {
  const failed = isFail(result.status?.name);
  const [open, setOpen] = useState(failed);
  const allSteps = [
    ...(result.backgrounds ?? []).map((s) => ({
      ...s,
      keyword: s.keyword ?? "Background",
    })),
    ...(result.steps ?? []),
    ...(result.hooks ?? []).map((s) => ({
      ...s,
      keyword: s.keyword ?? "Hook",
    })),
  ];

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border",
        failed
          ? "border-red-200 dark:border-red-800"
          : "border-slate-200 dark:border-slate-700",
      )}
    >
      <button
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2 text-left text-xs",
          failed
            ? "bg-red-50/60 dark:bg-red-950/20"
            : "bg-slate-50/80 dark:bg-slate-800/80",
        )}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-slate-400" />
        )}
        <Play className="h-3 w-3 shrink-0 text-slate-400" />
        <span className="font-semibold text-slate-600 dark:text-slate-300">
          {result.name ?? `${scenarioType ?? "Scenario"} #${index + 1}`}
        </span>
        {result.status?.name && (
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-bold",
              stepStatusColor(result.status.name),
            )}
          >
            {result.status.name}
          </span>
        )}
        {result.duration != null && (
          <span className="ml-auto text-[10px] text-slate-400">
            {formatDuration(result.duration)}
          </span>
        )}
      </button>

      {open && (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {allSteps.map((step, i) => (
            <CucumberStepRow
              key={`${i}:${step.keyword}:${(step.name ?? "").slice(0, 30)}`}
              step={step}
              index={i}
            />
          ))}

          {result.log && (
            <div className="px-3 py-2">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Log Output
              </p>
              <pre className="whitespace-pre-wrap break-words rounded bg-slate-100 px-2.5 py-1.5 font-mono text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                {result.log}
              </pre>
            </div>
          )}

          {allSteps.length === 0 && (
            <p className="px-3 py-2 text-xs italic text-slate-400">
              No step details available.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Cucumber results section (replaces raw <pre>) ────────────────────────────

function CucumberResultsSection({
  run,
}: {
  run: TestRun;
}) {
  const results = run.results ?? [];
  const hasResults = results.length > 0 && results.some((r) => (r.steps?.length ?? 0) > 0);

  if (!hasResults && !run.gherkin) return null;

  // When we have rich step-level results, show them
  if (hasResults) {
    return (
      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          <FileText className="h-3 w-3" />
          Cucumber Scenarios ({results.length})
        </p>
        {results.map((result, i) => (
          <CucumberScenarioPanel
            key={i}
            result={result}
            index={i}
            {...(run.scenario_type ? { scenarioType: run.scenario_type } : {})}
          />
        ))}
      </div>
    );
  }

  // Fallback: parse raw Gherkin definition with keyword coloring
  return <GherkinDefinitionPanel gherkin={run.gherkin!} />;
}

// ── Gherkin definition panel (keyword-colored read-only view) ────────────────

function GherkinDefinitionPanel({ gherkin }: { gherkin: string }) {
  const lines = gherkin.split("\n");

  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
        <FileText className="h-3 w-3" />
        Gherkin Scenario
      </p>
      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {lines.map((line, i) => {
            const trimmed = line.trim();
            if (!trimmed) return null;

            const match = GHERKIN_KEYWORDS.exec(trimmed);
            if (match) {
              const keyword = match[1] ?? "";
              const rest = trimmed.slice(match[0].length);
              return (
                <div key={i} className="flex items-start gap-2 px-3 py-1.5">
                  <span
                    className={cn(
                      "mt-0.5 shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold",
                      gherkinKeywordStyle(keyword),
                    )}
                  >
                    {keyword}
                  </span>
                  <p className="text-xs text-slate-700 dark:text-slate-200">{rest}</p>
                </div>
              );
            }

            // Non-step lines (Feature:, Scenario:, comments, tags)
            const isHeader = /^(Feature|Scenario|Background|Examples|@)/.test(trimmed);
            return (
              <div
                key={i}
                className={cn(
                  "px-3 py-1.5 text-xs",
                  isHeader
                    ? "font-semibold text-slate-600 dark:text-slate-300"
                    : "font-mono text-slate-500 dark:text-slate-400",
                )}
              >
                {trimmed}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Last run section ─────────────────────────────────────────────────────────

function LastRunSection({ run, jiraUrl }: { run: TestRun; jiraUrl?: string }) {
  const execKey = run.test_execution?.jira?.key;
  const runFailed = isFail(run.status.name);
  const hasSteps = (run.steps?.length ?? 0) > 0;
  const hasIterations = (run.iterations?.results.length ?? 0) > 0;

  return (
    <div className="space-y-3">
      {/* Run header: status, execution key, executor, dates */}
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge
          name={run.status.name}
          {...(run.status.color ? { color: run.status.color } : {})}
        />
        {execKey && jiraUrl && (
          <button
            className="flex cursor-pointer items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[10px] text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
            title={`Open ${execKey} in Jira`}
            onClick={() => void openUrl(`${jiraUrl.replace(/\/+$/, "")}/browse/${execKey}`)}
          >
            <ExternalLink className="h-3 w-3" />
            {execKey}
          </button>
        )}
        {execKey && !jiraUrl && (
          <span className="flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[10px] text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
            <ExternalLink className="h-3 w-3" />
            {execKey}
          </span>
        )}
        {run.executed_by_id && (
          <span className="flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
            <User className="h-3 w-3" />
            <UserName accountId={run.executed_by_id} />
          </span>
        )}
        {run.started_on && (
          <span className="flex items-center gap-1 text-[10px] text-slate-400">
            <Clock className="h-3 w-3" />
            {formatDate(run.started_on)}
          </span>
        )}
        {run.finished_on && (
          <span className="text-[10px] text-slate-400">
            → {formatDate(run.finished_on)}
          </span>
        )}
      </div>

      {/* Executor comment — elevated for failed runs */}
      {run.comment && <ExecutorComment comment={run.comment} failed={runFailed} />}

      {/* Failed steps summary banner */}
      {runFailed && hasSteps && <FailedStepsSummary steps={run.steps!} />}

      {/* Full step results */}
      {hasSteps && (
        <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
          <div className="border-b border-slate-100 bg-slate-50/80 px-3 py-1.5 dark:border-slate-700 dark:bg-slate-800/80">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Steps ({run.steps!.length})
            </p>
          </div>
          <StepResultsTable steps={run.steps!} {...(jiraUrl ? { jiraUrl } : {})} />
        </div>
      )}

      {/* Iterations (parametrized datasets) */}
      {hasIterations && (
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Iterations ({run.iterations!.results.length})
          </p>
          <IterationsSection iterations={run.iterations!.results} />
        </div>
      )}

      {/* Cucumber failed steps summary banner */}
      {runFailed && run.results && run.results.length > 0 && (
        <CucumberFailedStepsSummary results={run.results} />
      )}

      {/* Cucumber / Gherkin results — rich step-by-step view */}
      {(run.gherkin || (run.results && run.results.length > 0)) && (
        <CucumberResultsSection run={run} />
      )}

      {/* Run-level evidence gallery */}
      {run.evidence && run.evidence.length > 0 && (
        <EvidenceGallery evidence={run.evidence} label={`Evidence (${run.evidence.length})`} />
      )}

      {/* Linked defects */}
      {run.defects && run.defects.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Linked Defects
          </p>
          <div className="flex flex-wrap gap-1.5">
            {run.defects.map((key) => (
              <DefectChip key={key} issueKey={key} {...(jiraUrl ? { jiraUrl } : {})} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main modal ───────────────────────────────────────────────────────────────

interface CoverageTestDetailModalProps {
  testIssueId: string;
  testKey: string;
  projectKey: string;
  /** Status from the coverage list — shown immediately while run details load. */
  coverageStatus?: { name: string; color?: string } | null | undefined;
  onClose: () => void;
}

export function CoverageTestDetailModal({
  testIssueId,
  testKey,
  projectKey,
  coverageStatus,
  onClose,
}: CoverageTestDetailModalProps) {
  const { data: jiraDetail, isLoading: jiraLoading } = useIssueDetail(testKey);
  const { data: xrayDetail, isLoading: xrayLoading } = useTestDetail(testKey);
  const { data: runs, isLoading: runsLoading } = useTestRunsByTestId(testIssueId);
  const { data: config } = useConfig();
  const jiraUrl = config?.jira_url;

  const [bugModalOpen, setBugModalOpen] = useState(false);
  const [linkedBugKey, setLinkedBugKey] = useState<string | null>(null);
  const addDefects = useAddDefectsToTestRun();

  // Backend sorts runs by ID descending (highest = most recent), matching
  // Xray's own "latest status" computation. Just take the first result.
  const latestRun = runs?.results?.[0] ?? null;

  const testTypeName = xrayDetail?.test_type?.name;
  const isCucumber =
    testTypeName?.toLowerCase().includes("cucumber") ||
    testTypeName?.toLowerCase().includes("gherkin");
  const isGeneric =
    testTypeName?.toLowerCase().includes("generic") ||
    testTypeName?.toLowerCase().includes("unstructured");

  const priorityClass = (p?: string | null): string => {
    const v = p?.toLowerCase() ?? "";
    if (v === "highest" || v === "critical") return "text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/30";
    if (v === "high") return "text-orange-600 bg-orange-50 dark:text-orange-400 dark:bg-orange-900/30";
    if (v === "medium") return "text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/30";
    if (v === "low") return "text-blue-500 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/30";
    return "text-slate-500 bg-slate-100 dark:text-slate-400 dark:bg-slate-700";
  };

  // Build a prefilled description for the bug modal
  const bugDescription = useMemo(() => {
    if (!latestRun) return "";
    const failedSteps = (latestRun.steps ?? [])
      .map((s: TestRunStep, i: number) => ({ ...s, index: i + 1 }))
      .filter((s: TestRunStep & { index: number }) => {
        const n = s.status?.name?.toUpperCase() ?? "";
        return n === "FAIL" || n === "FAILED";
      });
    const lines: string[] = [`Test: ${testKey}`];
    if (latestRun.test_execution?.jira?.key) {
      lines.push(`Execution: ${latestRun.test_execution.jira.key}`);
    }
    lines.push(`Status: ${latestRun.status.name}`);
    if (latestRun.comment) {
      lines.push("");
      lines.push(`Executor comment: ${latestRun.comment}`);
    }
    if (failedSteps.length > 0) {
      lines.push("");
      lines.push("Failed steps:");
      for (const s of failedSteps) {
        lines.push(`  Step ${s.index}: ${s.action ?? "(no action)"}`);
        if (s.actual_result) lines.push(`    Actual: ${s.actual_result}`);
        if (s.comment) lines.push(`    Comment: ${s.comment}`);
      }
    }
    return lines.join("\n");
  }, [latestRun, testKey]);

  const handleBugCreated = async (bugKey: string) => {
    setLinkedBugKey(bugKey);
    if (latestRun && latestRun.test_execution) {
      try {
        await addDefects.mutateAsync({
          testRunId: latestRun.id,
          issueKeys: [bugKey],
          executionIssueId: latestRun.test_execution.issue_id,
        });
      } catch {
        // Bug was created but linking failed — user sees the bug key anyway
      }
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: "rgba(0,0,0,0.5)" }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
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
                  {jiraLoading && !jiraDetail ? "Loading…" : jiraDetail?.summary ?? testKey}
                </h2>
                <div className="flex items-center gap-2">
                  {jiraUrl ? (
                    <button
                      className="cursor-pointer font-mono text-xs text-slate-400 hover:text-blue-500 hover:underline"
                      onClick={() =>
                        void openUrl(`${jiraUrl.replace(/\/+$/, "")}/browse/${testKey}`)
                      }
                      title={`Open ${testKey} in Jira`}
                    >
                      {testKey}
                    </button>
                  ) : (
                    <p className="font-mono text-xs text-slate-400">{testKey}</p>
                  )}
                  {testTypeName && (
                    <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      {testTypeName}
                    </span>
                  )}
                  {/* Show status badge in header — from latest run or coverage list fallback */}
                  {(latestRun || coverageStatus) && (
                    <StatusBadge
                      name={latestRun?.status.name ?? coverageStatus?.name ?? ""}
                      {...((latestRun?.status.color ?? coverageStatus?.color)
                        ? { color: (latestRun?.status.color ?? coverageStatus?.color)! }
                        : {})}
                    />
                  )}
                  {runsLoading && (
                    <span className="flex items-center gap-1 text-[10px] text-slate-400">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Fetching execution…
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Create Bug button in header */}
              {latestRun && (
                <button
                  onClick={() => setBugModalOpen(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
                >
                  <Bug className="h-3.5 w-3.5" />
                  Create Bug
                </button>
              )}
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Body — progressive loading: show content as each piece arrives */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <div className="space-y-4">
              {/* Jira metadata — show as soon as jiraDetail is available */}
              {jiraLoading && !jiraDetail && (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading Jira details…
                </div>
              )}
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

                {/* Linked bug confirmation */}
                {linkedBugKey && (
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400">
                    <Bug className="h-3.5 w-3.5" />
                    Bug{" "}
                    {jiraUrl ? (
                      <button
                        className="cursor-pointer font-mono font-bold hover:underline"
                        onClick={() =>
                          void openUrl(
                            `${jiraUrl.replace(/\/+$/, "")}/browse/${linkedBugKey}`,
                          )
                        }
                      >
                        {linkedBugKey}
                      </button>
                    ) : (
                      <span className="font-mono font-bold">{linkedBugKey}</span>
                    )}{" "}
                    created and linked as defect.
                  </div>
                )}

                {/* ── Last Run Results (primary section) ── */}
                {runsLoading && !latestRun && (
                  <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800">
                    <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                    Fetching latest execution result…
                  </div>
                )}
                {!runsLoading && latestRun && (
                  <Section title="Last Execution Result" defaultOpen badge={
                    <StatusBadge
                      name={latestRun.status.name}
                      {...(latestRun.status.color ? { color: latestRun.status.color } : {})}
                    />
                  }>
                    <LastRunSection run={latestRun} {...(jiraUrl ? { jiraUrl } : {})} />
                  </Section>
                )}
                {!runsLoading && !latestRun && (
                  <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800">
                    <AlertCircle className="h-4 w-4 text-slate-400" />
                    This test has no execution results yet.
                  </div>
                )}

                {/* ── Test Definition (collapsible) — show as soon as xrayDetail arrives ── */}
                {xrayLoading && !xrayDetail && (
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading test definition…
                  </div>
                )}
                {!isCucumber &&
                  !isGeneric &&
                  xrayDetail?.steps &&
                  xrayDetail.steps.length > 0 && (
                    <Section
                      title={`Test Steps (${xrayDetail.steps.length})`}
                      defaultOpen={!latestRun}
                    >
                      <div className="overflow-x-auto rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                        <DefinitionStepsTable steps={xrayDetail.steps} />
                      </div>
                    </Section>
                  )}

                {isCucumber && xrayDetail?.gherkin && (
                  <Section title="Gherkin Definition" defaultOpen={!latestRun}>
                    <GherkinDefinitionPanel gherkin={xrayDetail.gherkin} />
                  </Section>
                )}

                {isGeneric && xrayDetail?.unstructured && (
                  <Section title="Test Definition" defaultOpen={!latestRun}>
                    <pre className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      {xrayDetail.unstructured}
                    </pre>
                  </Section>
                )}

                {/* Description with inline images */}
                {jiraDetail && jiraDetail.description_blocks.length > 0 && (
                  <Section title="Description">
                    <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800">
                      {jiraDetail.description_blocks.map((block: DescriptionBlock, i: number) => {
                        if (block.type === "text") {
                          return (
                            <p
                              key={i}
                              className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300"
                            >
                              {block.content}
                            </p>
                          );
                        }
                        const att = jiraDetail.attachments.find(
                          (a) => a.filename === block.filename,
                        );
                        return att ? (
                          <div key={i} className="py-1">
                            <AttachmentPreview attachment={att} inline />
                          </div>
                        ) : null;
                      })}
                    </div>
                  </Section>
                )}

                {/* Remaining attachments (not embedded in description) */}
                {jiraDetail && (() => {
                  const embeddedFilenames = new Set(
                    jiraDetail.description_blocks
                      .filter((b): b is Extract<DescriptionBlock, { type: "media" }> => b.type === "media")
                      .map((b) => b.filename),
                  );
                  const remaining = jiraDetail.attachments.filter(
                    (a) => !embeddedFilenames.has(a.filename),
                  );
                  if (remaining.length === 0) return null;
                  return (
                    <Section title={`Attachments (${remaining.length})`}>
                      <div className="flex flex-wrap gap-3">
                        {remaining.map((att) => (
                          <AttachmentPreview key={att.id} attachment={att} />
                        ))}
                      </div>
                    </Section>
                  );
                })()}

                {/* No content at all */}
                {!xrayLoading &&
                  xrayDetail &&
                  !xrayDetail.steps?.length &&
                  !xrayDetail.gherkin &&
                  !xrayDetail.unstructured &&
                  !runsLoading &&
                  !latestRun && (
                    <p className="text-sm italic text-slate-400">
                      No test steps defined in Xray.
                    </p>
                  )}
              </div>
          </div>
        </div>
      </div>

      {/* Create Bug modal */}
      <CreateBugModal
        open={bugModalOpen}
        onClose={() => setBugModalOpen(false)}
        projectKey={projectKey}
        prefillDescription={bugDescription}
        onBugCreated={(key) => void handleBugCreated(key)}
      />
    </>
  );
}
