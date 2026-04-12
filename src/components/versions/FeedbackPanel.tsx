import { useState, useCallback, useMemo, useRef, useEffect, memo } from "react";
import {
  BookOpen,
  AlertTriangle,
  Check,
  CheckCircle2,
  Circle,
  Edit3,
  ExternalLink,
  Link2Off,
  Loader2,
  Paperclip,
  Pencil,
  Plus,
  Save,
  Search,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { open as openFilePicker } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";

import {
  useConfluencePage,
  useUpdateConfluencePage,
  useUploadConfluenceAttachment,
  useConfluenceAttachments,
  useConfluenceAttachmentFile,
  useSearchUsers,
  useVersionRelatedWork,
  useCreateVersionRelatedWork,
  useDeleteVersionRelatedWork,
} from "@/services/queries";
import { useConfluenceStore } from "@/stores/confluenceStore";
import type { ConfluencePageMapping } from "@/stores/confluenceStore";
import { needsTranscode, transcodeToMp4 } from "@/services/videoTranscoder";
import { ConfluencePagePicker } from "./ConfluencePagePicker";
import { Button } from "@/components/ui/button";
import type { JiraVersion, JiraUser, ConfluenceAttachment } from "@/types";

// ── Issue row parsed from the Confluence table ──────────────────────────────

interface IssueRow {
  status: string;
  jiraTicket: string;
  priority: string;
  description: string;
  comment: string;
  assignedDeveloper: string;
  developerAccountId: string;
  isDone: boolean;
  /** Filenames of images/videos attached to the description cell. */
  descriptionAttachments: string[];
  /** Filenames of images/videos attached to the comment cell. */
  commentAttachments: string[];
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Extract attachment filenames from `<ac:image>` / `<ri:attachment>` tags in raw HTML. */
function extractAttachmentFilenames(rawHtml: string): string[] {
  const filenames: string[] = [];
  // Flexible regex: handles attribute reordering, extra attributes, optional self-closing slash
  const re = /<ri:attachment[^>]*\bri:filename="([^"]+)"[^>]*\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rawHtml)) !== null) {
    if (m[1]) filenames.push(m[1]);
  }
  return filenames;
}

/** Build `<ac:image>` tags for a list of attachment filenames. */
function buildImageTags(filenames: string[]): string {
  return filenames
    .map((f) => `<ac:image ac:width="300"><ri:attachment ri:filename="${escHtml(f)}" /></ac:image>`)
    .join("");
}

function parseIssueRows(html: string): IssueRow[] {
  const issuesMatch = html.match(
    /<h2[^>]*>\s*Issues\s*<\/h2>\s*<table[^>]*>([\s\S]*?)<\/table>/i,
  );
  if (!issuesMatch?.[1]) return [];
  const tableHtml = issuesMatch[1];

  const tbodyMatch = tableHtml.match(/<tbody>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch?.[1]) return [];

  const rows: IssueRow[] = [];
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch: RegExpExecArray | null;

  while ((trMatch = trRegex.exec(tbodyMatch[1])) !== null) {
    const rawCells: string[] = [];
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let tdMatch: RegExpExecArray | null;
    while ((tdMatch = tdRegex.exec(trMatch[1]!)) !== null) {
      rawCells.push(tdMatch[1] ?? "");
    }
    if (rawCells.length < 6) continue;

    // Column order: Description, Comment, Priority, Jira Ticket, Assigned Dev, Status
    const descRaw = rawCells[0] ?? "";
    const commentRaw = rawCells[1] ?? "";
    const description = stripHtml(descRaw);
    const comment = stripHtml(commentRaw);
    const descriptionAttachments = extractAttachmentFilenames(descRaw);
    const commentAttachments = extractAttachmentFilenames(commentRaw);
    const priority = stripHtml(rawCells[2] ?? "");
    const jiraTicket = stripHtml(rawCells[3] ?? "");

    const devRaw = rawCells[4] ?? "";
    const mentionMatch = devRaw.match(
      /<ri:user\s+ri:account-id="([^"]+)"\s*\/>/i,
    );
    const developerAccountId = mentionMatch?.[1] ?? "";
    const dev = stripHtml(devRaw);

    const status = stripHtml(rawCells[5] ?? "");

    const hasContent = jiraTicket || priority || description || comment || dev;
    if (!hasContent) continue;

    const statusLower = status.toLowerCase().trim();
    const isDone =
      statusLower === "done" ||
      statusLower === "closed" ||
      statusLower === "resolved" ||
      statusLower.includes("✅");

    rows.push({
      status, jiraTicket, priority, description, comment,
      assignedDeveloper: dev, developerAccountId, isDone,
      descriptionAttachments, commentAttachments,
    });
  }

  return rows;
}

/** Build the developer cell content — Confluence user mention if accountId is available. */
function buildDevCell(name: string, accountId: string): string {
  if (accountId) {
    return `<ac:link><ri:user ri:account-id="${escHtml(accountId)}" /></ac:link>`;
  }
  return escHtml(name);
}

/**
 * Inject a new `<tr>` into the Issues `<tbody>` of the Confluence storage HTML.
 * Returns the updated HTML string.
 */
function injectIssueRow(
  html: string,
  fields: {
    jiraTicket: string;
    priority: string;
    description: string;
    comment: string;
    developer: string;
    developerAccountId: string;
    descriptionAttachments?: string[];
    commentAttachments?: string[];
  },
): string {
  const devContent = buildDevCell(fields.developer, fields.developerAccountId);
  const descImages = buildImageTags(fields.descriptionAttachments ?? []);
  const commentImages = buildImageTags(fields.commentAttachments ?? []);
  const row =
    `<tr>` +
    `<td><p>${escHtml(fields.description)}</p>${descImages}</td>` +
    `<td><p>${escHtml(fields.comment)}</p>${commentImages}</td>` +
    `<td><p>${escHtml(fields.priority)}</p></td>` +
    `<td><p>${escHtml(fields.jiraTicket)}</p></td>` +
    `<td><p>${devContent}</p></td>` +
    `<td><p>Open</p></td>` +
    `</tr>`;

  // Find the Issues table's </tbody> and insert before it
  const pattern = /(<h2[^>]*>\s*Issues\s*<\/h2>\s*<table[^>]*>[\s\S]*?<tbody>)([\s\S]*?)(<\/tbody>)/i;
  return html.replace(pattern, `$1$2${row}\n  $3`);
}

/**
 * Replace the Nth `<tr>` inside the Issues `<tbody>` with updated cell values.
 * `rowIndex` is 0-based. Returns the updated HTML string.
 */
function replaceIssueRow(
  html: string,
  rowIndex: number,
  fields: {
    status: string;
    jiraTicket: string;
    priority: string;
    description: string;
    comment: string;
    developer: string;
    developerAccountId: string;
    descriptionAttachments?: string[];
    commentAttachments?: string[];
  },
): string {
  const pattern =
    /(<h2[^>]*>\s*Issues\s*<\/h2>\s*<table[^>]*>[\s\S]*?<tbody>)([\s\S]*?)(<\/tbody>)/i;
  const match = html.match(pattern);
  if (!match) return html;

  const prefix = match[1]!;
  const tbody = match[2]!;
  const suffix = match[3]!;

  const rows: string[] = [];
  const trRegex = /<tr[^>]*>[\s\S]*?<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = trRegex.exec(tbody)) !== null) rows.push(m[0]);

  if (rowIndex < 0 || rowIndex >= rows.length) return html;

  const devContent = buildDevCell(fields.developer, fields.developerAccountId);
  const descImages = buildImageTags(fields.descriptionAttachments ?? []);
  const commentImages = buildImageTags(fields.commentAttachments ?? []);
  rows[rowIndex] =
    `<tr>` +
    `<td><p>${escHtml(fields.description)}</p>${descImages}</td>` +
    `<td><p>${escHtml(fields.comment)}</p>${commentImages}</td>` +
    `<td><p>${escHtml(fields.priority)}</p></td>` +
    `<td><p>${escHtml(fields.jiraTicket)}</p></td>` +
    `<td><p>${devContent}</p></td>` +
    `<td><p>${escHtml(fields.status)}</p></td>` +
    `</tr>`;

  return html.replace(pattern, `${prefix}${rows.join("\n  ")}${suffix}`);
}

interface AddIssueForm {
  jiraTicket: string;
  priority: string;
  description: string;
  comment: string;
  developer: string;
  developerAccountId: string;
  descriptionAttachments: string[];
  commentAttachments: string[];
}

// ── Component ────────────────────────────────────────────────────────────────

interface FeedbackPanelProps {
  version: JiraVersion;
  projectKey: string;
}

const RELATED_WORK_TITLE_PREFIX = "QAlity Feedback";
const RELATED_WORK_CATEGORY = "Documentation";

export function FeedbackPanel({ version }: FeedbackPanelProps) {
  const { getVersionPage, setVersionPage, removeVersionPage } = useConfluenceStore();

  // ── Source of truth: Jira version Related Work entries ─────────────────────
  const {
    data: relatedWork,
    isLoading: relatedWorkLoading,
  } = useVersionRelatedWork(version.id);
  const createRelatedWork = useCreateVersionRelatedWork(version.id);
  const deleteRelatedWork = useDeleteVersionRelatedWork(version.id);

  // Derive the mapping from the QAlity Related Work entry
  const relatedWorkMapping: ConfluencePageMapping | null = useMemo(() => {
    if (!relatedWork) return null;
    const entry = relatedWork.find((rw) =>
      rw.title?.startsWith(RELATED_WORK_TITLE_PREFIX),
    );
    if (!entry?.url) return null;
    const idMatch = entry.url.match(/\/pages\/(\d+)/);
    if (!idMatch?.[1]) return null;
    return { pageId: idMatch[1], spaceId: "", parentId: null };
  }, [relatedWork]);

  // Local mapping (optimistic cache only — speeds up UI after creation)
  const localMapping = getVersionPage(version.id);

  // Related Work is the source of truth; fall back to local for optimistic UX
  const mapping = relatedWorkMapping ?? localMapping ?? null;

  // Guard: prevent self-healing from re-linking right after an unlink
  const unlinkingRef = useRef(false);

  const [showPicker, setShowPicker] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftBody, setDraftBody] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<AddIssueForm>({
    jiraTicket: "",
    priority: "",
    description: "",
    comment: "",
    developer: "",
    developerAccountId: "",
    descriptionAttachments: [],
    commentAttachments: [],
  });

  const {
    data: page,
    isLoading,
    isError,
    error,
  } = useConfluencePage(mapping?.pageId);

  const updatePage = useUpdateConfluencePage();
  const { data: attachments } = useConfluenceAttachments(mapping?.pageId);

  const handleCreated = useCallback(
    (
      pageId: string,
      spaceId: string,
      parentId: string | null,
      webUrl: string | null,
      pageTitle: string,
    ) => {
      // Save locally for instant UI response
      setVersionPage(version.id, { pageId, spaceId, parentId });
      setShowPicker(false);
      // Create the Related Work entry on the Jira version (source of truth)
      if (webUrl) {
        createRelatedWork.mutate({
          category: RELATED_WORK_CATEGORY,
          title: `${RELATED_WORK_TITLE_PREFIX} — ${pageTitle}`,
          url: webUrl,
        });
      }
    },
    [version.id, setVersionPage, createRelatedWork],
  );

  const startEditing = () => {
    setDraftBody(page?.body_storage ?? "");
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setDraftBody("");
    updatePage.reset();
  };

  const saveEditing = async () => {
    if (!page || page.version_number == null) return;
    try {
      await updatePage.mutateAsync({
        pageId: page.id,
        versionNumber: page.version_number,
        title: page.title,
        body: draftBody,
      });
      setEditing(false);
      setDraftBody("");
    } catch {
      // error is displayed via updatePage.isError
    }
  };

  const handleUnlink = () => {
    unlinkingRef.current = true;
    removeVersionPage(version.id);
    setEditing(false);
    setDraftBody("");
    // Delete the QAlity Related Work entry (source of truth)
    const entry = relatedWork?.find((rw) =>
      rw.title?.startsWith(RELATED_WORK_TITLE_PREFIX),
    );
    if (entry?.relatedWorkId) {
      deleteRelatedWork.mutate(entry.relatedWorkId);
    }
  };

  const handleAddIssue = async () => {
    if (!page || page.version_number == null) return;
    if (!addForm.description.trim()) return;

    const currentHtml = page.body_storage ?? "";
    const updatedHtml = injectIssueRow(currentHtml, addForm);

    try {
      await updatePage.mutateAsync({
        pageId: page.id,
        versionNumber: page.version_number,
        title: page.title,
        body: updatedHtml,
      });
      setAddForm({ jiraTicket: "", priority: "", description: "", comment: "", developer: "", developerAccountId: "", descriptionAttachments: [], commentAttachments: [] });
      setShowAddForm(false);
    } catch {
      // error is displayed via updatePage.isError
    }
  };

  const handleEditIssue = useCallback(
    async (
      rowIndex: number,
      fields: {
        status: string;
        jiraTicket: string;
        priority: string;
        description: string;
        comment: string;
        developer: string;
        developerAccountId: string;
        descriptionAttachments?: string[];
        commentAttachments?: string[];
      },
    ) => {
      if (!page || page.version_number == null) return;
      const updatedHtml = replaceIssueRow(
        page.body_storage ?? "",
        rowIndex,
        fields,
      );
      await updatePage.mutateAsync({
        pageId: page.id,
        versionNumber: page.version_number,
        title: page.title,
        body: updatedHtml,
      });
    },
    [page, updatePage],
  );

  const handleToggleIssue = useCallback(
    async (rowIndex: number, row: IssueRow) => {
      const newStatus = row.isDone ? "Open" : "Done";
      await handleEditIssue(rowIndex, {
        status: newStatus,
        jiraTicket: row.jiraTicket,
        priority: row.priority,
        description: row.description,
        comment: row.comment,
        developer: row.assignedDeveloper,
        developerAccountId: row.developerAccountId,
        descriptionAttachments: row.descriptionAttachments,
        commentAttachments: row.commentAttachments,
      });
    },
    [handleEditIssue],
  );

  // Parse issue rows — must be above early returns to satisfy Rules of Hooks
  const issueRows = useMemo(
    () => parseIssueRows(page?.body_storage ?? ""),
    [page?.body_storage],
  );

  // Migration: if a local mapping exists but no Related Work entry yet, create
  // one once the page loads (so the URL is available). This migrates legacy
  // local-only links into the shared Related Work source of truth.
  useEffect(() => {
    if (unlinkingRef.current) return;
    if (createRelatedWork.isPending || createRelatedWork.isSuccess) return;
    if (!localMapping || relatedWorkMapping) return;
    if (!page?.web_url) return;
    createRelatedWork.mutate({
      category: RELATED_WORK_CATEGORY,
      title: `${RELATED_WORK_TITLE_PREFIX} — ${page.title}`,
      url: page.web_url,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localMapping, relatedWorkMapping, page?.web_url]);

  // ── Loading state while Related Work is being fetched ──────────────────────
  if (relatedWorkLoading && !localMapping) {
    return (
      <div className="flex h-48 items-center justify-center gap-2 text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading feedback link…</span>
      </div>
    );
  }
  // ── No page linked ─────────────────────────────────────────────────────────
  if (!mapping) {
    if (showPicker) {
      return (
        <div className="flex h-full flex-col p-1">
          <ConfluencePagePicker
            version={version}
            onCreated={handleCreated}
            onCancel={() => setShowPicker(false)}
          />
        </div>
      );
    }

    return (
      <div className="flex h-full flex-col gap-4 p-1">
        <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-slate-200 py-16 text-center dark:border-slate-700">
          <BookOpen className="h-10 w-10 text-slate-300 dark:text-slate-600" />
          <div>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              No Confluence page linked
            </p>
            <p className="mt-1 max-w-sm text-xs text-slate-400 dark:text-slate-500">
              Create a dedicated Confluence page for this version to track QA feedback,
              checklists, and sign-off using Confluence&apos;s rich editing features.
            </p>
          </div>
          <Button
            onClick={() => setShowPicker(true)}
            className="mt-1 gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Create Confluence Page
          </Button>
        </div>
      </div>
    );
  }

  // ── Loading / Error ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  if (isError || !page) {
    return (
      <div className="flex h-full flex-col gap-4 p-1">
        <div className="rounded-md border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
          <p className="text-sm text-red-700 dark:text-red-300">
            Failed to load Confluence page: {String(error ?? "Page not found")}
          </p>
          <button
            onClick={handleUnlink}
            className="mt-2 text-xs text-red-500 underline hover:text-red-700"
          >
            Unlink this page
          </button>
        </div>
      </div>
    );
  }

  // ── Page loaded ────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col gap-3 p-1">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-blue-500" />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {page.title}
          </span>
          {updatePage.isPending && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
          )}
        </div>
        <div className="flex items-center gap-1">
          {page.web_url && (
            <button
              onClick={() => void openUrl(page.web_url!)}
              title="Open in Confluence"
              className="rounded p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-700 dark:hover:text-blue-400"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          )}
          {!editing && (
            <button
              onClick={startEditing}
              title="Edit raw HTML"
              className="rounded p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
            >
              <Edit3 className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={handleUnlink}
            title="Unlink page (does not delete)"
            className="rounded p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30 dark:hover:text-red-400"
          >
            <Link2Off className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Error */}
      {updatePage.isError && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {String(updatePage.error)}
        </p>
      )}

      {/* Content */}
      {editing ? (
        <div className="flex flex-1 flex-col gap-2">
          <textarea
            value={draftBody}
            onChange={(e) => setDraftBody(e.target.value)}
            className="flex-1 min-h-[200px] rounded-lg border border-slate-200 bg-white p-3 font-mono text-xs text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
            placeholder="Confluence storage format HTML…"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={cancelEditing} disabled={updatePage.isPending}>
              <X className="h-3.5 w-3.5" />
              Cancel
            </Button>
            <Button size="sm" onClick={() => void saveEditing()} disabled={updatePage.isPending}>
              {updatePage.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Save
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
          {/* Issues header */}
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Issues
            </h3>
            <div className="flex items-center gap-2">
              {issueRows.length > 0 && (
                <span className="text-xs text-slate-400">
                  {issueRows.filter((r) => r.isDone).length}/{issueRows.length} done
                </span>
              )}
              {!showAddForm && (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-xs
                    font-medium text-blue-600 transition-colors hover:bg-blue-100
                    dark:bg-blue-950 dark:text-blue-400 dark:hover:bg-blue-900"
                >
                  <Plus className="h-3 w-3" />
                  Add Issue
                </button>
              )}
            </div>
          </div>

          {/* Add issue form */}
          {showAddForm && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-800 dark:bg-blue-950/30">
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Jira Ticket (e.g. PROJ-123)"
                  value={addForm.jiraTicket}
                  onChange={(e) => setAddForm((f) => ({ ...f, jiraTicket: e.target.value }))}
                  className="rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs
                    text-slate-700 placeholder:text-slate-400 focus:border-blue-400
                    focus:outline-none dark:border-slate-700 dark:bg-slate-900
                    dark:text-slate-200"
                />
                <select
                  value={addForm.priority}
                  onChange={(e) => setAddForm((f) => ({ ...f, priority: e.target.value }))}
                  className="rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs
                    text-slate-700 focus:border-blue-400 focus:outline-none
                    dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <option value="">Priority</option>
                  <option value="Blocker">Blocker</option>
                  <option value="Critical">Critical</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                  <option value="Trivial">Trivial</option>
                </select>
                {mapping && (
                  <>
                    <MediaTextArea
                      value={addForm.description}
                      onChange={(v) => setAddForm((f) => ({ ...f, description: v }))}
                      placeholder="Description *"
                      pageId={mapping.pageId}
                      attachments={addForm.descriptionAttachments}
                      onAttachmentsChange={(fns) => setAddForm((f) => ({ ...f, descriptionAttachments: fns }))}
                      allAttachments={attachments ?? []}
                      disabled={updatePage.isPending}
                      label="Description"
                      className="col-span-2"
                    />
                    <MediaTextArea
                      value={addForm.comment}
                      onChange={(v) => setAddForm((f) => ({ ...f, comment: v }))}
                      placeholder="Comment"
                      pageId={mapping.pageId}
                      attachments={addForm.commentAttachments}
                      onAttachmentsChange={(fns) => setAddForm((f) => ({ ...f, commentAttachments: fns }))}
                      allAttachments={attachments ?? []}
                      disabled={updatePage.isPending}
                      label="Comment"
                      className="col-span-2"
                    />
                  </>
                )}
                <UserSearchInput
                  value={addForm.developer}
                  onChange={(name, accountId) =>
                    setAddForm((f) => ({ ...f, developer: name, developerAccountId: accountId }))
                  }
                  disabled={updatePage.isPending}
                  placeholder="Assigned Developer"
                />
              </div>
              <div className="mt-2.5 flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowAddForm(false);
                    setAddForm({ jiraTicket: "", priority: "", description: "", comment: "", developer: "", developerAccountId: "", descriptionAttachments: [], commentAttachments: [] });
                  }}
                  disabled={updatePage.isPending}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => void handleAddIssue()}
                  disabled={updatePage.isPending || !addForm.description.trim()}
                >
                  {updatePage.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  Add
                </Button>
              </div>
            </div>
          )}

          {/* Issue cards */}
          {issueRows.length === 0 && !showAddForm ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-200 py-10 dark:border-slate-700">
              <Circle className="h-6 w-6 text-slate-300 dark:text-slate-600" />
              <p className="text-xs text-slate-400">No issues yet. Click &ldquo;Add Issue&rdquo; to get started.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {issueRows.map((row, idx) => (
                <IssueCard
                  key={idx}
                  row={row}
                  rowIndex={idx}
                  isSaving={updatePage.isPending}
                  pageId={mapping!.pageId}
                  allAttachments={attachments ?? []}
                  onToggle={() => void handleToggleIssue(idx, row)}
                  onEdit={(fields) => void handleEditIssue(idx, fields)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── User search input ────────────────────────────────────────────────────────

interface UserSearchInputProps {
  value: string;
  onChange: (displayName: string, accountId: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

function UserSearchInput({
  value,
  onChange,
  disabled,
  placeholder = "Search user…",
}: UserSearchInputProps) {
  const [searchText, setSearchText] = useState(value);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: users, isFetching } = useSearchUsers(debouncedQuery);

  const handleInput = (text: string) => {
    setSearchText(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(text);
      setShowDropdown(true);
    }, 350);
  };

  const handleSelect = (user: JiraUser) => {
    setSearchText(user.display_name);
    onChange(user.display_name, user.account_id);
    setShowDropdown(false);
    setDebouncedQuery("");
  };

  const handleClear = () => {
    setSearchText("");
    onChange("", "");
    setDebouncedQuery("");
    setShowDropdown(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-1">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={placeholder}
            value={searchText}
            onChange={(e) => handleInput(e.target.value)}
            onFocus={() => {
              if (debouncedQuery.length >= 2) setShowDropdown(true);
            }}
            onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
            disabled={disabled}
            className="w-full rounded border border-slate-200 bg-white py-1.5 pl-7 pr-7 text-xs
              text-slate-700 placeholder:text-slate-400 focus:border-blue-400
              focus:outline-none dark:border-slate-700 dark:bg-slate-900
              dark:text-slate-200"
          />
          {searchText && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5
                text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {showDropdown && debouncedQuery.length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-36 overflow-y-auto
          rounded-md border border-slate-200 bg-white shadow-lg
          dark:border-slate-700 dark:bg-slate-800"
        >
          {isFetching ? (
            <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-slate-400">
              <Loader2 className="h-3 w-3 animate-spin" /> Searching…
            </div>
          ) : !users?.length ? (
            <p className="px-3 py-2.5 text-xs text-slate-400">No users found.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-700">
              {users.map((user) => (
                <li key={user.account_id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs
                      hover:bg-slate-50 dark:hover:bg-slate-700"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSelect(user)}
                  >
                    {user.avatar_urls?.["16x16"] && (
                      <img
                        src={user.avatar_urls["16x16"]}
                        alt=""
                        className="h-4 w-4 rounded-full"
                      />
                    )}
                    <span className="text-slate-700 dark:text-slate-300">
                      {user.display_name}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ── Attachment helpers ────────────────────────────────────────────────────────

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "bmp"];
const VIDEO_EXTENSIONS = ["mp4", "mov", "webm", "avi", "mkv"];
const MEDIA_EXTENSIONS = [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS];

function isImageFile(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTENSIONS.includes(ext);
}

function isVideoFile(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return VIDEO_EXTENSIONS.includes(ext);
}

function isMediaFile(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return MEDIA_EXTENSIONS.includes(ext);
}

/**
 * A textarea with integrated drag-and-drop file attachment support.
 * Wraps the textarea in a drop zone that highlights on drag-over.
 * Files can be attached via drag-and-drop or by clicking the attach button.
 */
function MediaTextArea({
  value,
  onChange,
  placeholder,
  pageId,
  attachments: fileNames,
  onAttachmentsChange,
  allAttachments,
  disabled,
  label,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  pageId: string;
  attachments: string[];
  onAttachmentsChange: (fns: string[]) => void;
  allAttachments: ConfluenceAttachment[];
  disabled?: boolean;
  label: string;
  className?: string;
}) {
  const upload = useUploadConfluenceAttachment();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Keep a ref to the latest upload-handling state so the single drag-drop
  // listener (registered once) always reads current values — no stale closures.
  const stateRef = useRef({ pageId, fileNames, onAttachmentsChange, disabled });
  stateRef.current = { pageId, fileNames, onAttachmentsChange, disabled };

  const MAX_FILE_SIZE_MB = 100;

  const doUpload = useCallback(
    async (paths: string[]) => {
      const { pageId: pid, fileNames: fns, onAttachmentsChange: onChange, disabled: dis } = stateRef.current;
      if (paths.length === 0 || dis) return;
      setUploading(true);
      setUploadError(null);
      const errors: string[] = [];
      try {
        const uploaded: string[] = [];
        for (const p of paths) {
          const fname = p.split("/").pop() ?? p.split("\\").pop() ?? p;
          if (!isMediaFile(fname)) {
            errors.push(`"${fname}" is not a supported media file`);
            continue;
          }
          try {
            const att = await upload.mutateAsync({ pageId: pid, filePath: p });
            uploaded.push(att.title);
          } catch (err) {
            const msg = String(err);
            if (msg.toLowerCase().includes("too large") || msg.toLowerCase().includes("size")) {
              errors.push(`"${fname}" is too large (max ${MAX_FILE_SIZE_MB} MB)`);
            } else {
              errors.push(`"${fname}" failed to upload: ${msg}`);
            }
          }
        }
        if (uploaded.length > 0) {
          onChange([...fns, ...uploaded]);
        }
      } catch (err) {
        errors.push(`Upload failed: ${String(err)}`);
      } finally {
        setUploading(false);
        if (errors.length > 0) {
          setUploadError(errors.join(" · "));
        }
      }
    },
    [upload],
  );

  // Tauri native drag-drop: use event position to hit-test this zone.
  // HTML5 drag events do NOT fire for external file drops in macOS WKWebView,
  // so we rely entirely on Tauri's onDragDropEvent + getBoundingClientRect.
  // Registered ONCE (empty deps) to prevent listener leaks; reads latest
  // state through stateRef / doUpload.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (cancelled || !wrapperRef.current) return;
        const payload = event.payload;

        if (payload.type === "leave") {
          setDragOver(false);
          return;
        }

        // Hit-test: is the cursor over this zone?
        const pos = payload.position;
        const rect = wrapperRef.current.getBoundingClientRect();
        const scale = window.devicePixelRatio || 1;
        // Try both raw and scaled coords (physical vs logical varies by OS)
        const hit =
          (pos.x >= rect.left && pos.x <= rect.right &&
           pos.y >= rect.top && pos.y <= rect.bottom) ||
          (scale !== 1 &&
           pos.x / scale >= rect.left && pos.x / scale <= rect.right &&
           pos.y / scale >= rect.top && pos.y / scale <= rect.bottom);

        if (payload.type === "over" || payload.type === "enter") {
          setDragOver(hit);
        } else if (payload.type === "drop") {
          setDragOver(false);
          if (hit) {
            void doUpload(payload.paths);
          }
        }
      })
      .then((fn) => {
        if (cancelled) { fn(); } else { unlisten = fn; }
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [doUpload]);

  const handlePick = async () => {
    const result = await openFilePicker({
      multiple: true,
      title: `Attach to ${label}`,
      filters: [{ name: "Images & Videos", extensions: MEDIA_EXTENSIONS }],
    });
    if (!result || (Array.isArray(result) && result.length === 0)) return;
    const paths: string[] = Array.isArray(result) ? result : [result];
    await doUpload(paths);
  };

  const mediaFiles = fileNames.filter((f) => isImageFile(f) || isVideoFile(f));

  return (
    <div ref={wrapperRef} className={`relative ${className ?? ""}`}>
      {/* Textarea with attach icon */}
      <div className="relative">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          rows={3}
          className={`w-full resize-y rounded-md border bg-white px-2.5 pb-6 pt-1.5
            text-xs text-slate-700 placeholder:text-slate-400 focus:border-blue-400
            focus:outline-none dark:bg-slate-900 dark:text-slate-200
            ${dragOver
              ? "border-blue-400 dark:border-blue-500"
              : uploading
                ? "border-amber-400 dark:border-amber-500"
                : "border-slate-200 dark:border-slate-700"}`}
        />

        {/* Drop overlay — shown on top of the textarea when dragging */}
        {dragOver && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center
            rounded-md bg-blue-50/80 dark:bg-blue-950/70"
          >
            <div className="flex flex-col items-center gap-1 text-blue-600 dark:text-blue-400">
              <Upload className="h-5 w-5" />
              <span className="text-xs font-medium">Drop files here</span>
            </div>
          </div>
        )}

        {/* Uploading overlay — shown on top of the textarea while uploading */}
        {uploading && !dragOver && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center
            rounded-md bg-amber-50/80 dark:bg-amber-950/50"
          >
            <div className="flex flex-col items-center gap-1 text-amber-600 dark:text-amber-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-xs font-medium">Uploading…</span>
            </div>
          </div>
        )}

        {/* Bottom-right attach icon inside the textarea */}
        <button
          type="button"
          onClick={() => void handlePick()}
          disabled={disabled || uploading}
          title="Attach image or video"
          className="absolute bottom-1.5 right-2 rounded p-0.5 text-slate-400
            transition-colors hover:text-blue-500 disabled:opacity-40
            dark:text-slate-500 dark:hover:text-blue-400"
        >
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Paperclip className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* Upload error banner */}
      {uploadError && (
        <div className="mt-1 flex items-start gap-1.5 rounded-md border border-red-200 bg-red-50
          px-2.5 py-1.5 text-[11px] text-red-700 dark:border-red-800 dark:bg-red-950/40
          dark:text-red-300"
        >
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="flex-1">{uploadError}</span>
          <button
            type="button"
            onClick={() => setUploadError(null)}
            className="shrink-0 rounded p-0.5 hover:bg-red-100 dark:hover:bg-red-900"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Filename chips */}
      {fileNames.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {fileNames.map((f, i) => (
            <span
              key={`${f}-${i}`}
              className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5
                text-[10px] text-blue-700 dark:bg-blue-950 dark:text-blue-300"
            >
              <Paperclip className="h-2.5 w-2.5" />
              {f}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onAttachmentsChange(fileNames.filter((_, idx) => idx !== i))}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-blue-200 dark:hover:bg-blue-800"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Inline thumbnails */}
      {mediaFiles.length > 0 && (
        <MediaPreviews filenames={mediaFiles} allAttachments={allAttachments} />
      )}
    </div>
  );
}

/** Single attachment preview item — uses a TanStack Query hook for reliable fetching + caching. */
const MediaPreviewItem = memo(function MediaPreviewItem({
  filename,
  attachment,
}: {
  filename: string;
  attachment: ConfluenceAttachment | undefined;
}) {
  const { data: dataUri, isLoading, isError } = useConfluenceAttachmentFile(
    attachment?.downloadUrl || null,
    attachment?.mediaType || "application/octet-stream",
  );

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [transcodedUri, setTranscodedUri] = useState<string | null>(null);
  const [transcoding, setTranscoding] = useState(false);
  const [transcodeError, setTranscodeError] = useState(false);
  const [videoBlobUrl, setVideoBlobUrl] = useState<string | null>(null);
  const isVideo = isVideoFile(filename);
  const requiresTranscode = isVideo && needsTranscode(filename);

  // Transcode .avi/.mkv to MP4 via FFmpeg.wasm when the raw data URI is ready
  useEffect(() => {
    if (!dataUri || !requiresTranscode) return;
    let cancelled = false;
    console.log(`[MediaPreview] Starting transcode for "${filename}" (ext=${filename.split(".").pop()})`);
    setTranscoding(true);
    setTranscodeError(false);
    transcodeToMp4(dataUri, attachment?.downloadUrl || filename)
      .then((mp4Uri) => {
        if (!cancelled) {
          console.log(`[MediaPreview] Transcode succeeded for "${filename}" (output ${mp4Uri.length} chars)`);
          setTranscodedUri(mp4Uri);
        }
      })
      .catch((err) => {
        console.error(`[MediaPreview] Transcode FAILED for "${filename}":`, err);
        if (!cancelled) setTranscodeError(true);
      })
      .finally(() => {
        if (!cancelled) setTranscoding(false);
      });
    return () => { cancelled = true; };
  }, [dataUri, requiresTranscode, attachment?.downloadUrl, filename]);

  // WKWebView blocks data: URIs for <video> — convert to Blob URL
  const videoDataUri = requiresTranscode ? transcodedUri : dataUri;
  useEffect(() => {
    if (!isVideo || !videoDataUri) return;
    let url: string | null = null;
    try {
      const [header, b64] = videoDataUri.split(",");
      const mime = header?.match(/data:(.*?);/)?.[1] ?? "video/mp4";
      const raw = atob(b64 ?? "");
      const buf = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
      url = URL.createObjectURL(new Blob([buf], { type: mime }));
      setVideoBlobUrl(url);
    } catch (err) {
      console.error(`[MediaPreview] Blob URL conversion failed for "${filename}":`, err);
      setVideoBlobUrl(null);
    }
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [isVideo, videoDataUri, filename]);

  const effectiveUri = isVideo ? videoBlobUrl : dataUri;
  const isMedia = !isError && !!effectiveUri && !transcodeError;
  const canPlay = isVideo && isMedia && !videoError;
  const showTranscoding = requiresTranscode && transcoding && !!dataUri;

  // Only flag unsupported format (code 4), not transient network/decode errors.
  const handleVideoError = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    const code = e.currentTarget.error?.code;
    const msg = e.currentTarget.error?.message ?? "unknown";
    console.error(
      `[MediaPreview] Video error for "${filename}" — code=${code}, message="${msg}", ` +
      `extension="${filename.split(".").pop()}", requiresTranscode=${requiresTranscode}`,
    );
    // MEDIA_ERR_SRC_NOT_SUPPORTED = 4
    if (code === 4) setVideoError(true);
  }, [filename, requiresTranscode]);

  return (
    <div className="relative">
      <div
        className={`overflow-hidden rounded border border-slate-200 dark:border-slate-700
          ${isMedia && !videoError ? "cursor-pointer transition-opacity hover:opacity-80" : ""}`}
        onClick={() => isMedia && !videoError && setLightboxOpen(true)}
        title={transcodeError
          ? `Transcode failed — ${filename}`
          : videoError
            ? `Unsupported video format — ${filename}`
            : isMedia ? `Click to enlarge — ${filename}` : filename}
      >
        {showTranscoding ? (
          <div className="flex h-20 w-28 flex-col items-center justify-center gap-1
            bg-slate-100 dark:bg-slate-800"
          >
            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
            <span className="text-[8px] text-slate-500">Converting…</span>
          </div>
        ) : transcodeError ? (
          <div className="flex h-20 w-28 flex-col items-center justify-center gap-0.5
            bg-red-50 text-red-400 dark:bg-red-950/30"
          >
            <AlertTriangle className="h-4 w-4" />
            <span className="text-center text-[8px] leading-tight">Transcode<br/>failed</span>
          </div>
        ) : effectiveUri ? (
          isVideo ? (
            videoError ? (
              <div className="flex h-20 w-28 flex-col items-center justify-center gap-0.5
                bg-slate-100 text-slate-400 dark:bg-slate-800"
              >
                <AlertTriangle className="h-4 w-4" />
                <span className="text-center text-[8px] leading-tight">Unsupported<br/>format</span>
              </div>
            ) : (
              <div className="relative flex h-20 w-28 items-center justify-center bg-black">
                <video
                  src={effectiveUri}
                  className="max-h-full max-w-full object-contain"
                  muted
                  playsInline
                  preload="auto"
                  onError={handleVideoError}
                />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="rounded-full bg-black/50 p-1.5">
                    <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5,3 19,12 5,21" />
                    </svg>
                  </div>
                </div>
              </div>
            )
          ) : (
            <div className="flex h-20 w-28 items-center justify-center bg-slate-100 dark:bg-slate-800">
              <img src={effectiveUri} alt={filename} className="max-h-full max-w-full object-contain" />
            </div>
          )
        ) : isError ? (
          <div className="flex h-20 w-28 flex-col items-center justify-center gap-0.5
            bg-red-50 text-red-400 dark:bg-red-950/30"
          >
            <X className="h-4 w-4" />
            <span className="text-[8px]">Failed</span>
          </div>
        ) : isLoading ? (
          <div className="flex h-20 w-28 items-center justify-center bg-slate-50 dark:bg-slate-800">
            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="flex h-20 w-28 items-center justify-center bg-slate-50 dark:bg-slate-800">
            <Paperclip className="h-4 w-4 text-slate-400" />
          </div>
        )}
      </div>

      {/* Lightbox modal */}
      {lightboxOpen && effectiveUri && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-6"
          style={{ background: "rgba(0,0,0,0.85)" }}
          onClick={() => setLightboxOpen(false)}
        >
          <button
            className="absolute right-4 top-4 rounded-full bg-black/40 p-2 text-white
              hover:bg-black/60"
            onClick={() => setLightboxOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded bg-black/50 px-3 py-1
            text-xs text-white/80"
          >
            {filename}
          </p>
          {canPlay ? (
            <video
              src={effectiveUri}
              controls
              autoPlay
              className="max-h-full max-w-full rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <img
              src={effectiveUri}
              alt={filename}
              className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
      )}
    </div>
  );
});

/** Display thumbnails for attached images and videos from a Confluence page. */
function MediaPreviews({
  filenames,
  allAttachments,
}: {
  filenames: string[];
  allAttachments: ConfluenceAttachment[];
}) {
  if (filenames.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {filenames.map((f) => (
        <MediaPreviewItem
          key={f}
          filename={f}
          attachment={allAttachments.find((a) => a.title === f)}
        />
      ))}
    </div>
  );
}

// ── Issue card sub-component ─────────────────────────────────────────────────

interface IssueCardProps {
  row: IssueRow;
  rowIndex: number;
  isSaving: boolean;
  pageId: string;
  allAttachments: ConfluenceAttachment[];
  onToggle: () => void;
  onEdit: (fields: {
    status: string;
    jiraTicket: string;
    priority: string;
    description: string;
    comment: string;
    developer: string;
    developerAccountId: string;
    descriptionAttachments?: string[];
    commentAttachments?: string[];
  }) => void;
}

function IssueCard({ row, rowIndex: _rowIndex, isSaving, pageId, allAttachments, onToggle, onEdit }: IssueCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftDescAttachments, setDraftDescAttachments] = useState<string[]>(row.descriptionAttachments);
  const [draftCommentAttachments, setDraftCommentAttachments] = useState<string[]>(row.commentAttachments);
  const [draft, setDraft] = useState({
    status: row.status || "Open",
    jiraTicket: row.jiraTicket,
    priority: row.priority,
    description: row.description,
    comment: row.comment,
    developer: row.assignedDeveloper,
    developerAccountId: row.developerAccountId,
  });

  const startEdit = () => {
    setDraft({
      status: row.status || "Open",
      jiraTicket: row.jiraTicket,
      priority: row.priority,
      description: row.description,
      comment: row.comment,
      developer: row.assignedDeveloper,
      developerAccountId: row.developerAccountId,
    });
    setDraftDescAttachments(row.descriptionAttachments);
    setDraftCommentAttachments(row.commentAttachments);
    setIsEditing(true);
  };

  const cancelEdit = () => setIsEditing(false);

  const saveEdit = () => {
    onEdit({
      ...draft,
      descriptionAttachments: draftDescAttachments,
      commentAttachments: draftCommentAttachments,
    });
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50/50 px-4 py-3
        dark:border-amber-700 dark:bg-amber-950/20"
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
            Editing issue
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={cancelEdit}
              disabled={isSaving}
              title="Cancel"
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600
                dark:hover:bg-slate-700 dark:hover:text-slate-300"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={saveEdit}
              disabled={isSaving || !draft.description.trim()}
              title="Save"
              className="rounded p-1 text-blue-500 hover:bg-blue-50 hover:text-blue-700
                disabled:opacity-40 dark:hover:bg-blue-950 dark:hover:text-blue-300"
            >
              {isSaving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            placeholder="Jira Ticket"
            value={draft.jiraTicket}
            onChange={(e) => setDraft((d) => ({ ...d, jiraTicket: e.target.value }))}
            className="rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs
              text-slate-700 placeholder:text-slate-400 focus:border-blue-400
              focus:outline-none dark:border-slate-700 dark:bg-slate-900
              dark:text-slate-200"
          />
          <select
            value={draft.priority}
            onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value }))}
            className="rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs
              text-slate-700 focus:border-blue-400 focus:outline-none
              dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="">Priority</option>
            <option value="Blocker">Blocker</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
            <option value="Trivial">Trivial</option>
          </select>
          <MediaTextArea
            value={draft.description}
            onChange={(v) => setDraft((d) => ({ ...d, description: v }))}
            placeholder="Description *"
            pageId={pageId}
            attachments={draftDescAttachments}
            onAttachmentsChange={setDraftDescAttachments}
            allAttachments={allAttachments}
            disabled={isSaving}
            label="Description"
            className="col-span-2"
          />
          <MediaTextArea
            value={draft.comment}
            onChange={(v) => setDraft((d) => ({ ...d, comment: v }))}
            placeholder="Comment"
            pageId={pageId}
            attachments={draftCommentAttachments}
            onAttachmentsChange={setDraftCommentAttachments}
            allAttachments={allAttachments}
            disabled={isSaving}
            label="Comment"
            className="col-span-2"
          />
          <UserSearchInput
            value={draft.developer}
            onChange={(name, accountId) =>
              setDraft((d) => ({ ...d, developer: name, developerAccountId: accountId }))
            }
            disabled={isSaving}
            placeholder="Assigned Developer"
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`group rounded-lg border px-4 py-3 transition-colors ${
        row.isDone
          ? "border-green-200 bg-green-50 dark:border-green-800/50 dark:bg-green-950/30"
          : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Status toggle */}
        <button
          onClick={onToggle}
          disabled={isSaving}
          title={row.isDone ? "Mark as open" : "Mark as done"}
          className="mt-0.5 shrink-0 transition-transform hover:scale-110 disabled:opacity-50"
        >
          {row.isDone ? (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          ) : (
            <Circle className="h-4 w-4 text-slate-300 hover:text-green-400
              dark:text-slate-600 dark:hover:text-green-500" />
          )}
        </button>

        {/* Content */}
        <div className="min-w-0 flex-1">
          {/* Top row: ticket + priority + status + edit button */}
          <div className="flex flex-wrap items-center gap-2">
            {row.jiraTicket && (
              <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs font-semibold
                text-blue-700 dark:bg-blue-950 dark:text-blue-300"
              >
                {row.jiraTicket}
              </span>
            )}
            {row.priority && <PriorityBadge priority={row.priority} />}
            <span
              className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold
                uppercase tracking-wide ${
                  row.isDone
                    ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300"
                    : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                }`}
            >
              {row.status || "Open"}
            </span>
            <button
              onClick={startEdit}
              disabled={isSaving}
              title="Edit issue"
              className="rounded p-1 text-slate-400 opacity-0 transition-opacity
                hover:bg-slate-100 hover:text-slate-600
                group-hover:opacity-100
                dark:hover:bg-slate-700 dark:hover:text-slate-300"
            >
              <Pencil className="h-3 w-3" />
            </button>
          </div>

          {/* Description */}
          {row.description && (
            <p
              className={`mt-1.5 text-sm ${
                row.isDone
                  ? "text-green-700 line-through decoration-green-400/50 dark:text-green-300"
                  : "text-slate-700 dark:text-slate-200"
              }`}
            >
              {row.description}
            </p>
          )}
          {row.descriptionAttachments.length > 0 && (
            <MediaPreviews
              filenames={row.descriptionAttachments.filter((f) => isImageFile(f) || isVideoFile(f))}
              allAttachments={allAttachments}
            />
          )}

          {/* Comment */}
          {row.comment && (
            <p className="mt-1 text-xs italic text-slate-500 dark:text-slate-400">
              &ldquo;{row.comment}&rdquo;
            </p>
          )}
          {row.commentAttachments.length > 0 && (
            <MediaPreviews
              filenames={row.commentAttachments.filter((f) => isImageFile(f) || isVideoFile(f))}
              allAttachments={allAttachments}
            />
          )}

          {/* Assigned developer */}
          {row.assignedDeveloper && (
            <div className="mt-2 flex items-center gap-1.5">
              <div className="flex h-5 w-5 items-center justify-center rounded-full
                bg-slate-200 text-[10px] font-bold uppercase text-slate-600
                dark:bg-slate-700 dark:text-slate-300"
              >
                {row.assignedDeveloper.charAt(0)}
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {row.assignedDeveloper}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Priority badge ───────────────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: string }) {
  const lower = priority.toLowerCase();
  let color =
    "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400";
  if (lower.includes("critical") || lower.includes("blocker")) {
    color = "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300";
  } else if (lower.includes("high") || lower.includes("major")) {
    color = "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300";
  } else if (lower.includes("medium") || lower.includes("normal")) {
    color = "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300";
  } else if (lower.includes("low") || lower.includes("minor") || lower.includes("trivial")) {
    color = "bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-300";
  }

  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${color}`}>
      {priority}
    </span>
  );
}
