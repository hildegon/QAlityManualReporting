import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Shield, ShieldCheck, X, Loader2, FileWarning } from "lucide-react";
import {
  useCurrentJiraUser,
  useUpdateConfluencePage,
} from "@/services/queries";
import { cn } from "@/components/ui/utils";
import type { ConfluencePage, JiraVersion, QaApproval } from "@/types";

// ── Confluence page body helpers ──────────────────────────────────────────────

/**
 * Confluence's storage format strips unknown `data-*` attributes when it
 * persists an updated page, so we cannot rely on attribute markers to
 * identify the QA Approval row. Instead, we identify it by its content:
 * a `<tr>` containing a `<th>` with the literal text "QA Approval".
 *
 * The `<td>` then carries the status as visible text — either:
 *   - "Pending"                              → not approved
 *   - "✓ Approved by <name> on <date>[ · <note>]" → approved
 */
const QA_ROW_RE =
  /<tr\b[^>]*>[\s\S]*?<th\b[^>]*>[\s\S]*?QA Approval[\s\S]*?<\/th>[\s\S]*?<td\b[^>]*>([\s\S]*?)<\/td>[\s\S]*?<\/tr>/i;

/** Matches the Version Info table tbody. */
const VERSION_INFO_TBODY_RE =
  /(<h2[^>]*>\s*Version Info\s*<\/h2>\s*<table[^>]*>[\s\S]*?<tbody>)([\s\S]*?)(<\/tbody>)/i;

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Decode ALL HTML entities — named (`&eacute;`), decimal (`&#233;`), and hex (`&#xE9;`) —
 * by delegating to the browser's built-in HTML parser via a textarea element.
 * This handles the full 250+ named entity set that Confluence may produce.
 */
function unescHtml(s: string): string {
  if (!s) return s;
  try {
    const ta = document.createElement("textarea");
    ta.innerHTML = s;
    return ta.value;
  } catch {
    // Fallback: manually decode the most common entities.
    return s
      .replace(/&nbsp;/g, "\u00a0")
      .replace(/&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#([0-9]+);/g, (_, n: string) => String.fromCodePoint(parseInt(n, 10)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&amp;/g, "&");
  }
}

/** Strip HTML tags from a fragment to get plain visible text. */
function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Build the pending placeholder row. */
function buildPendingRow(): string {
  return (
    `<tr>` +
    `<th><p><strong>QA Approval</strong></p></th>` +
    `<td><p>Pending</p></td>` +
    `</tr>`
  );
}

/** Build the approved row. The visible text in the <td> is the source of truth. */
function buildApprovedRow(approval: QaApproval, formattedDate: string): string {
  const noteSpan = approval.note ? ` · ${escHtml(approval.note)}` : "";
  return (
    `<tr>` +
    `<th><p><strong>QA Approval</strong></p></th>` +
    `<td><p>✓ Approved by ${escHtml(approval.display_name)} on ${escHtml(formattedDate)}${noteSpan}</p></td>` +
    `</tr>`
  );
}

/**
 * Replace (or insert) the QA Approval row in the Version Info table.
 * If no Version Info table exists, returns the body unchanged.
 */
function setQaApprovalRow(body: string, newRow: string): string {
  if (QA_ROW_RE.test(body)) {
    return body.replace(QA_ROW_RE, newRow);
  }
  if (!VERSION_INFO_TBODY_RE.test(body)) return body;
  return body.replace(VERSION_INFO_TBODY_RE, (_m, before: string, content: string, after: string) =>
    `${before}${content}${newRow}\n  ${after}`,
  );
}

/**
 * Parse the QA Approval row from a page body. Returns the approval if the row
 * exists and indicates approval, otherwise null. **Source of truth** for the
 * banner — Confluence page is the only persistence layer.
 *
 * Identifies the row by the literal "QA Approval" text in the `<th>` (since
 * Confluence strips `data-*` attributes on save). Determines status by
 * checking whether the `<td>` text starts with "✓ Approved" or "Approved".
 */
export function parseQaApprovalFromBody(body: string | null | undefined): QaApproval | null {
  if (!body) return null;
  const match = body.match(QA_ROW_RE);
  if (!match) return null;
  const tdHtml = match[1] ?? "";
  const text = unescHtml(stripTags(tdHtml));
  // "✓ Approved by <name> on <date>[ · <note>]" — accept with or without the check mark.
  const approvedRe = /^\s*[✓✔]?\s*Approved by\s+(.+?)\s+on\s+(.+?)(?:\s+·\s+(.+?))?\s*$/i;
  const m = text.match(approvedRe);
  if (!m) return null;
  const displayName = (m[1] ?? "").trim();
  const dateStr = (m[2] ?? "").trim();
  const note = m[3]?.trim();
  // Try to parse the date back to ISO; fall back to the raw string if unparseable.
  const parsedDate = new Date(dateStr);
  const approvedAt = isNaN(parsedDate.getTime()) ? dateStr : parsedDate.toISOString();
  const approval: QaApproval = {
    approved: true,
    display_name: displayName || "Unknown reviewer",
    account_id: "",
    approved_at: approvedAt,
    ...(note ? { note } : {}),
  };
  return approval;
}

// ─────────────────────────────────────────────────────────────────────────────

interface QaApprovalBannerProps {
  version: JiraVersion;
  projectKey: string;
  /** Confluence feedback page linked to this release, if any. */
  feedbackPage?: ConfluencePage;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function QaApprovalBanner({ version, feedbackPage }: QaApprovalBannerProps) {
  const { data: currentUser, error: userError } = useCurrentJiraUser();
  const updatePage = useUpdateConfluencePage();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [note, setNote] = useState("");

  // Source of truth: the QA Approval row in the Confluence page body.
  const approval = parseQaApprovalFromBody(feedbackPage?.body_storage);
  const isSaving = updatePage.isPending;
  const isRevoking = updatePage.isPending;
  const setError = updatePage.error;
  const hasNoFeedbackPage = !feedbackPage;

  const handleApprove = () => {
    if (!feedbackPage) return;
    const displayName = currentUser?.display_name ?? "Unknown reviewer";
    const approvedAt = new Date().toISOString();
    const dateStr = new Date(approvedAt).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const payload: QaApproval = {
      approved: true,
      display_name: displayName,
      account_id: currentUser?.account_id ?? "",
      approved_at: approvedAt,
      ...(note.trim() ? { note: note.trim() } : {}),
    };
    const approvedRow = buildApprovedRow(payload, dateStr);
    updatePage.mutate(
      {
        pageId: feedbackPage.id,
        title: feedbackPage.title,
        // Use transform so the mutation always fetches the latest version,
        // preventing 409 Conflict errors from stale cached version numbers.
        transform: (currentBody) => setQaApprovalRow(currentBody, approvedRow),
      },
      {
        onSuccess: () => {
          setDialogOpen(false);
          setNote("");
        },
      },
    );
  };

  const handleRevoke = () => {
    if (!feedbackPage) return;
    // Revoking resets the row to "Pending" — keeps the row visible in Confluence.
    const pendingRow = buildPendingRow();
    updatePage.mutate({
      pageId: feedbackPage.id,
      title: feedbackPage.title,
      transform: (currentBody) => setQaApprovalRow(currentBody, pendingRow),
    });
  };

  // version.name is used in the dialog body below.

  if (approval) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/30">
        <div className="flex min-w-0 items-center gap-3">
          <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-500" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
              QA Approved
            </p>
            <p className="truncate text-xs text-emerald-600 dark:text-emerald-400">
              {approval.display_name} · {formatDate(approval.approved_at)}
              {approval.note && (
                <span className="before:mx-1.5 before:content-['·']">{approval.note}</span>
              )}
            </p>
          </div>
        </div>
        <button
          onClick={handleRevoke}
          disabled={isRevoking}
          className="shrink-0 rounded px-2 py-1 text-xs font-medium text-emerald-600 transition-colors hover:bg-emerald-100 hover:text-emerald-800 disabled:opacity-50 dark:text-emerald-400 dark:hover:bg-emerald-900/40 dark:hover:text-emerald-200"
          title="Revoke QA approval"
        >
          {isRevoking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Revoke"}
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-center gap-3">
          <Shield className="h-5 w-5 shrink-0 text-slate-400" />
          <div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              QA Approval
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              {hasNoFeedbackPage
                ? "Link a Confluence feedback page to enable approval"
                : "This release has not yet been approved by QA"}
            </p>
          </div>
        </div>
        {hasNoFeedbackPage ? (
          <div
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-400 dark:border-slate-600 dark:text-slate-500"
            title="Link a Confluence feedback page first"
          >
            <FileWarning className="h-3.5 w-3.5" />
            No feedback page
          </div>
        ) : (
          <Dialog.Root
            open={dialogOpen}
            onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) setNote("");
            }}
          >
            <Dialog.Trigger asChild>
              <button className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50 dark:bg-emerald-700 dark:hover:bg-emerald-600">
                Approve release
              </button>
            </Dialog.Trigger>

            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
              <Dialog.Content className={cn(
                "fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2",
                "rounded-xl border border-slate-200 bg-white p-6 shadow-xl",
                "dark:border-slate-700 dark:bg-slate-800",
                "data-[state=open]:animate-in data-[state=closed]:animate-out",
                "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
                "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
              )}>
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-emerald-500" />
                    <Dialog.Title className="text-base font-semibold text-slate-800 dark:text-slate-100">
                      Approve release
                    </Dialog.Title>
                  </div>
                  <Dialog.Close asChild>
                    <button className="rounded p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                      <X className="h-4 w-4" />
                    </button>
                  </Dialog.Close>
                </div>

                <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
                  Marking{" "}
                  <span className="font-medium text-slate-700 dark:text-slate-200">
                    {version.name}
                  </span>{" "}
                  as QA approved.
                  {currentUser && (
                    <>
                      {" "}This will be recorded as approved by{" "}
                      <span className="font-medium text-slate-700 dark:text-slate-200">
                        {currentUser.display_name}
                      </span>
                      {" "}in the Confluence feedback page.
                    </>
                  )}
                </p>

                {userError && (
                  <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                    Could not look up your Jira identity — approval will be saved without a verified reviewer name.
                  </div>
                )}

                <div className="mb-5">
                  <label
                    htmlFor="qa-approval-note"
                    className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300"
                  >
                    Note{" "}
                    <span className="font-normal text-slate-400">(optional)</span>
                  </label>
                  <textarea
                    id="qa-approval-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="e.g. All regression tests passed, no open blockers"
                    rows={3}
                    className={cn(
                      "w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm",
                      "placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400",
                      "dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500",
                      "dark:focus:border-emerald-500 dark:focus:ring-emerald-500",
                    )}
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Dialog.Close asChild>
                    <button className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600">
                      Cancel
                    </button>
                  </Dialog.Close>
                  <button
                    onClick={handleApprove}
                    disabled={isSaving}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50 dark:bg-emerald-700 dark:hover:bg-emerald-600"
                  >
                    {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Confirm approval
                  </button>
                </div>

                {setError && (
                  <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
                    Failed to save approval: {String(setError)}
                  </div>
                )}
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        )}
      </div>
    </>
  );
}
