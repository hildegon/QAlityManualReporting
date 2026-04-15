import { useState, useMemo, useCallback } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  CheckSquare,
  Loader2,
  Paperclip,
  Square,
  X,
} from "lucide-react";
import { cn } from "@/components/ui/utils";
import { Button } from "@/components/ui/button";
import { getVersionRelatedWork, getConfluencePage } from "@/services/tauri";
import { queryKeys } from "@/services/queries/queryKeys";
import type { JiraVersion, VersionRelatedWork } from "@/types";
import type { IssueRow } from "./FeedbackPanel";
import { parseIssueRows, RELATED_WORK_TITLE_PREFIX } from "./FeedbackPanel";

// ── Props ────────────────────────────────────────────────────────────────────

interface CarryOverModalProps {
  currentVersion: JiraVersion;
  allVersions: JiraVersion[];
  onConfirm: (
    rows: IssueRow[],
    sourceVersionName: string,
    sourcePageId: string,
  ) => void;
  onClose: () => void;
  busy?: boolean | undefined;
  progressMessage?: string | undefined;
  errorMessage?: string | undefined;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Extract page ID from a Confluence URL like .../pages/12345/... */
function extractPageId(url: string): string | null {
  const m = url.match(/\/pages\/(\d+)/);
  return m?.[1] ?? null;
}

/** Count total attachments across selected rows */
function countAttachments(rows: IssueRow[]): number {
  return rows.reduce(
    (sum, r) => sum + r.descriptionAttachments.length + r.commentAttachments.length,
    0,
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export function CarryOverModal({
  currentVersion,
  allVersions,
  onConfirm,
  onClose,
  busy = false,
  progressMessage = "",
  errorMessage = "",
}: CarryOverModalProps) {
  // Step 1: pick source version, Step 2: select rows
  const [step, setStep] = useState<1 | 2>(1);
  const [sourceVersionId, setSourceVersionId] = useState<string>("");
  const [sourcePageId, setSourcePageId] = useState<string>("");
  const [sourceVersionName, setSourceVersionName] = useState("");
  const [loadingPage, setLoadingPage] = useState(false);
  const [pageError, setPageError] = useState<string>("");
  const [sourceRows, setSourceRows] = useState<IssueRow[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Filter out current version
  const otherVersions = useMemo(
    () => allVersions.filter((v) => v.id !== currentVersion.id),
    [allVersions, currentVersion.id],
  );

  // Parallel related-work queries via TanStack Query — uses cache (5min staleTime),
  // deduplicates, and runs all in parallel instead of sequential N calls
  const relatedWorkQueries = useQueries({
    queries: otherVersions.map((v) => ({
      queryKey: queryKeys.versionRelatedWork(v.id),
      queryFn: () => getVersionRelatedWork(v.id),
      staleTime: 5 * 60 * 1_000,
      gcTime: Infinity,
      retry: false,
    })),
  });

  // Derive version→pageId map from completed queries
  const versionPages = useMemo(() => {
    const results: { version: JiraVersion; pageId: string }[] = [];
    for (let i = 0; i < otherVersions.length; i++) {
      const q = relatedWorkQueries[i];
      if (!q || q.status !== "success" || !q.data) continue;
      const entry = (q.data as VersionRelatedWork[]).find((rw) =>
        rw.title?.startsWith(RELATED_WORK_TITLE_PREFIX),
      );
      if (entry?.url) {
        const pid = extractPageId(entry.url);
        if (pid) results.push({ version: otherVersions[i]!, pageId: pid });
      }
    }
    return results;
  }, [otherVersions, relatedWorkQueries]);

  const queriesLoading = relatedWorkQueries.some((q) => q.isLoading);
  const queriesSettled = relatedWorkQueries.every(
    (q) => q.status === "success" || q.status === "error",
  );
  const queriesProgress = relatedWorkQueries.filter(
    (q) => q.status === "success" || q.status === "error",
  ).length;

  // Carry-over candidates: only Open + In Progress
  const eligibleRows = useMemo(
    () => sourceRows.filter((r) => r.status === "Open" || r.status === "In Progress"),
    [sourceRows],
  );

  // Toggle individual row selection
  const toggleRow = useCallback((idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  // Select / deselect all
  const toggleAll = useCallback(() => {
    if (selected.size === eligibleRows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(eligibleRows.map((_, i) => i)));
    }
  }, [selected.size, eligibleRows]);

  // Load source page when user picks version
  const handlePickVersion = useCallback(
    async (versionId: string) => {
      const entry = versionPages.find((vp) => vp.version.id === versionId);
      if (!entry) return;
      setSourceVersionId(versionId);
      setSourceVersionName(entry.version.name);
      setSourcePageId(entry.pageId);
      setLoadingPage(true);
      setPageError("");
      try {
        const page = await getConfluencePage(entry.pageId);
        const rows = parseIssueRows(page.body_storage ?? "");
        setSourceRows(rows);
        const eligible = rows.filter(
          (r) => r.status === "Open" || r.status === "In Progress",
        );
        setSelected(new Set(eligible.map((_, i) => i)));
        setStep(2);
      } catch (e) {
        setPageError(String(e));
      } finally {
        setLoadingPage(false);
      }
    },
    [versionPages],
  );

  // Confirm carry-over
  const handleConfirm = useCallback(() => {
    const selectedRows = eligibleRows.filter((_, i) => selected.has(i));
    onConfirm(selectedRows, sourceVersionName, sourcePageId);
  }, [eligibleRows, selected, sourceVersionName, sourcePageId, onConfirm]);

  // Quick carry single item
  const handleCarrySingle = useCallback(
    (idx: number) => {
      const row = eligibleRows[idx];
      if (row) onConfirm([row], sourceVersionName, sourcePageId);
    },
    [eligibleRows, sourceVersionName, sourcePageId, onConfirm],
  );

  const selectedAttachmentCount = useMemo(
    () => countAttachments(eligibleRows.filter((_, i) => selected.has(i))),
    [eligibleRows, selected],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative mx-4 flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border
        border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
      >
        {/* Progress overlay */}
        {busy && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center
            rounded-xl bg-white/80 backdrop-blur-sm dark:bg-slate-900/80"
          >
            <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
            <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-200">
              {progressMessage || "Working…"}
            </p>
          </div>
        )}
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3
          dark:border-slate-700"
        >
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            Carry over feedback{sourceVersionName ? ` from ${sourceVersionName}` : ""}
          </h2>
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600
              dark:hover:bg-slate-800 dark:hover:text-slate-300 disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {step === 1 ? (
            <>
              <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                Pick source version to carry over Open / In Progress items from.
              </p>

              {queriesLoading && versionPages.length === 0 ? (
                <div className="flex items-center gap-2 py-8 text-sm text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Scanning versions… {queriesProgress}/{otherVersions.length}
                </div>
              ) : versionPages.length === 0 && queriesSettled ? (
                <p className="py-8 text-center text-sm text-slate-400">
                  No other versions have linked feedback pages.
                </p>
              ) : (
                <div className="space-y-1">
                  {versionPages.map((vp) => (
                    <button
                      key={vp.version.id}
                      onClick={() => void handlePickVersion(vp.version.id)}
                      disabled={loadingPage}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                        sourceVersionId === vp.version.id && loadingPage
                          ? "border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/30"
                          : "border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800",
                      )}
                    >
                      <span className="font-medium text-slate-700 dark:text-slate-200">
                        {vp.version.name}
                      </span>
                      {sourceVersionId === vp.version.id && loadingPage ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                      ) : (
                        <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                      )}
                    </button>
                  ))}
                  {!queriesSettled && (
                    <div className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-slate-400">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Scanning… {queriesProgress}/{otherVersions.length}
                    </div>
                  )}
                </div>
              )}

              {pageError && (
                <p className="mt-3 text-xs text-red-500">{pageError}</p>
              )}
            </>
          ) : (
            <>
              {/* Step 2 — row selection */}
              {eligibleRows.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">
                  No Open or In Progress items found in {sourceVersionName}.
                </p>
              ) : (
                <>
                  {/* Select all + summary */}
                  <div className="mb-3 flex items-center justify-between">
                    <button
                      onClick={toggleAll}
                      className="flex items-center gap-1.5 text-xs font-medium text-slate-600
                        hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                    >
                      {selected.size === eligibleRows.length ? (
                        <CheckSquare className="h-3.5 w-3.5 text-blue-500" />
                      ) : (
                        <Square className="h-3.5 w-3.5" />
                      )}
                      {selected.size === eligibleRows.length ? "Deselect all" : "Select all"}
                    </button>
                    <span className="text-xs text-slate-400">
                      {selected.size}/{eligibleRows.length} items
                      {selectedAttachmentCount > 0 && (
                        <> · <Paperclip className="inline h-3 w-3" /> {selectedAttachmentCount} files</>
                      )}
                    </span>
                  </div>

                  {/* Row list */}
                  <div className="max-h-[50vh] space-y-1 overflow-y-auto">
                    {eligibleRows.map((row, idx) => {
                      const attCount =
                        row.descriptionAttachments.length + row.commentAttachments.length;
                      return (
                        <div
                          key={idx}
                          className={cn(
                            "flex items-start gap-2 rounded-lg border px-3 py-2 transition-colors",
                            selected.has(idx)
                              ? "border-blue-200 bg-blue-50/50 dark:border-blue-800/50 dark:bg-blue-950/20"
                              : "border-slate-200 dark:border-slate-700",
                          )}
                        >
                          <button
                            onClick={() => toggleRow(idx)}
                            className="mt-0.5 shrink-0"
                          >
                            {selected.has(idx) ? (
                              <CheckSquare className="h-4 w-4 text-blue-500" />
                            ) : (
                              <Square className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                            )}
                          </button>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={cn(
                                  "rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase",
                                  row.status === "In Progress"
                                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
                                    : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
                                )}
                              >
                                {row.status}
                              </span>
                              {row.priority && (
                                <span className="text-[10px] text-slate-400">
                                  {row.priority}
                                </span>
                              )}
                              {attCount > 0 && (
                                <span className="flex items-center gap-0.5 text-[10px] text-slate-400">
                                  <Paperclip className="h-2.5 w-2.5" />
                                  {attCount}
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 text-sm text-slate-700 dark:text-slate-200">
                              {row.description || <em className="text-slate-400">No description</em>}
                            </p>
                            {row.jiraTicket && (
                              <span className="mt-0.5 text-[10px] text-blue-500">
                                {row.jiraTicket}
                              </span>
                            )}
                          </div>
                          {/* Quick single carry */}
                          <button
                            onClick={() => handleCarrySingle(idx)}
                            title="Carry this item only"
                            className="shrink-0 rounded p-1 text-slate-400 hover:bg-amber-100 hover:text-amber-600
                              dark:hover:bg-amber-900/30 dark:hover:text-amber-400"
                          >
                            <span className="text-xs">↩</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Back button */}
              <button
                onClick={() => setStep(1)}
                className="mt-3 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                ← Pick different version
              </button>
            </>
          )}
        </div>

        {/* Footer */}
        {step === 2 && eligibleRows.length > 0 && (
          <div className="border-t border-slate-200 px-5 py-3 dark:border-slate-700">
            {errorMessage && (
              <p className="mb-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs
                text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
                ⚠ {errorMessage}
              </p>
            )}
            {selectedAttachmentCount > 0 && !errorMessage && (
              <p className="mb-2 text-[10px] text-amber-600 dark:text-amber-400">
                ⚠ {selectedAttachmentCount} attachment(s) will be copied — uses {selectedAttachmentCount * 2} API calls
              </p>
            )}
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={selected.size === 0 || busy}
                onClick={handleConfirm}
              >
                <Check className="mr-1 h-3.5 w-3.5" />
                Carry over {selected.size} item{selected.size !== 1 ? "s" : ""}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
