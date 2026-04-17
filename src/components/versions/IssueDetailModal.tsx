import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { FileText, X, Loader2, Send, ChevronDown, User } from "lucide-react";
import {
  useAttachmentFile,
  useIssueTransitions,
  useTransitionIssue,
  useAddJiraComment,
  useIssueDetail,
} from "@/services/queries";
import { cn } from "@/components/ui/utils";
import { priorityClass } from "./utils";
import type { JiraAttachment, JiraCommentFlat, JiraIssueDetail, JiraTransition, DescriptionBlock } from "@/types";

// ── AttachmentPreview ──────────────────────────────────────────────────────────

export function AttachmentPreview({ attachment, inline = false }: { attachment: JiraAttachment; inline?: boolean }) {
  const isImage = attachment.mime_type.startsWith("image/");
  const isVideo = attachment.mime_type.startsWith("video/");
  const isMedia = isImage || isVideo;

  const thumbUrl = isImage && attachment.thumbnail ? attachment.thumbnail : attachment.content;
  const { data: thumbDataUri, isLoading, isError } = useAttachmentFile(
    isMedia ? thumbUrl : null,
    attachment.mime_type,
  );

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const needsFullFetch = lightboxOpen && isImage && attachment.thumbnail != null;
  const { data: fullDataUri } = useAttachmentFile(
    needsFullFetch ? attachment.content : null,
    attachment.mime_type,
  );
  const lightboxSrc = needsFullFetch ? (fullDataUri ?? thumbDataUri) : thumbDataUri;

  return (
    <>
      <div className={cn("flex flex-col items-center gap-1", inline && "w-full items-start")}>
        <div
          className={cn(
            "flex items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800",
            inline ? "max-h-64 w-full" : "h-20 w-20",
            isMedia && !isError && "cursor-pointer hover:opacity-90",
          )}
          onClick={() => isMedia && thumbDataUri && setLightboxOpen(true)}
          title={attachment.filename}
        >
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          ) : isError || !thumbDataUri ? (
            <FileText className="h-6 w-6 text-slate-400" />
          ) : isImage ? (
            <img src={thumbDataUri} alt={attachment.filename} className={cn("object-contain", inline ? "max-h-64 w-auto" : "h-full w-full object-cover")} />
          ) : isVideo ? (
            <video src={thumbDataUri} className="h-full w-full object-cover" muted preload="metadata" />
          ) : null}
        </div>
        {!inline && (
          <p className="w-20 truncate text-center text-[10px] text-slate-500 dark:text-slate-400" title={attachment.filename}>
            {attachment.filename}
          </p>
        )}
      </div>

      {lightboxOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-6"
          style={{ background: "rgba(0,0,0,0.85)" }}
          onClick={() => setLightboxOpen(false)}
        >
          <button
            className="absolute right-4 top-4 rounded-full bg-black/40 p-2 text-white hover:bg-black/60"
            onClick={() => setLightboxOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
          {isImage && lightboxSrc ? (
            <img
              src={lightboxSrc}
              alt={attachment.filename}
              className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          ) : isVideo && thumbDataUri ? (
            <video
              src={thumbDataUri}
              controls
              autoPlay
              className="max-h-full max-w-full rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <Loader2 className="h-8 w-8 animate-spin text-white" />
          )}
          <p className="absolute bottom-4 left-0 right-0 text-center text-sm text-white/70">
            {attachment.filename}
          </p>
        </div>
      )}
    </>
  );
}

// ── StatusTransitionDropdown ───────────────────────────────────────────────────

function StatusTransitionDropdown({
  issueKey,
  projectKey,
  versionName,
  currentStatus,
}: {
  issueKey: string;
  projectKey: string;
  versionName: string;
  currentStatus: string;
}) {
  const [open, setOpen] = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { data: transitions, isLoading } = useIssueTransitions(open ? issueKey : null);
  const { mutate: transitionIssue, isPending } = useTransitionIssue();

  const calcPos = useCallback(() => {
    if (!buttonRef.current) return;
    const r = buttonRef.current.getBoundingClientRect();
    setDropPos({ top: r.bottom + 4, left: r.left });
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const statusColor = (() => {
    const s = currentStatus.toLowerCase();
    if (s.includes("done") || s.includes("closed")) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
    if (s.includes("progress") || s.includes("acceptance")) return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    return "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300";
  })();

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => {
          calcPos();
          setOpen((o) => !o);
        }}
        disabled={isPending}
        className={cn(
          "flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium transition-opacity hover:opacity-80",
          statusColor,
          isPending && "opacity-50",
        )}
      >
        {isPending ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <ChevronDown className="h-2.5 w-2.5" />}
        {currentStatus}
      </button>

      {open && createPortal(
        <div
          ref={dropdownRef}
          style={{ position: "fixed", top: dropPos.top, left: dropPos.left, zIndex: 9999 }}
          className="min-w-[180px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800"
        >
          {isLoading ? (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-400">
              <Loader2 className="h-3 w-3 animate-spin" />Loading…
            </div>
          ) : !transitions?.length ? (
            <p className="px-3 py-2 text-xs italic text-slate-400">No transitions available</p>
          ) : (
            <ul>
              {transitions.map((t: JiraTransition) => (
                <li key={t.id}>
                  <button
                    onClick={() => {
                      transitionIssue(
                        { issueKey, transitionId: t.id, executionProjectKey: projectKey, versionName },
                        { onSettled: () => setOpen(false) },
                      );
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <span className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      t.to.category?.key === "done" ? "bg-emerald-500"
                      : t.to.category?.key === "indeterminate" ? "bg-blue-500"
                      : "bg-slate-400",
                    )} />
                    {t.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}

// ── CommentItem ────────────────────────────────────────────────────────────────

function CommentItem({ comment }: { comment: JiraCommentFlat }) {
  const date = comment.created
    ? new Date(comment.created).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-300">
          {comment.author?.[0]?.toUpperCase() ?? "?"}
        </span>
        <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
          {comment.author ?? "Unknown"}
        </span>
        {date && (
          <span className="ml-auto text-[10px] text-slate-400">{date}</span>
        )}
      </div>
      {comment.body ? (
        <p className="whitespace-pre-wrap text-xs text-slate-600 dark:text-slate-300">
          {comment.body}
        </p>
      ) : (
        <p className="text-xs italic text-slate-400">Empty comment.</p>
      )}
    </div>
  );
}

// ── IssueDetailContent ─────────────────────────────────────────────────────────

function IssueDetailContent({
  detail,
  issueKey,
  projectKey,
  versionName,
}: {
  detail: JiraIssueDetail;
  issueKey: string;
  projectKey: string;
  versionName: string;
}) {
  const attachmentByFilename = useMemo(
    () => new Map(detail.attachments.map((a) => [a.filename, a])),
    [detail.attachments],
  );

  const embeddedFilenames = useMemo(
    () => new Set(detail.description_blocks.filter((b): b is Extract<DescriptionBlock, { type: "media" }> => b.type === "media").map((b) => b.filename)),
    [detail.description_blocks],
  );

  const remainingAttachments = detail.attachments.filter((a) => !embeddedFilenames.has(a.filename));
  const hasDescription = detail.description_blocks.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {detail.issue_type && (
          <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {detail.issue_type}
          </span>
        )}
        {detail.status && (
          <StatusTransitionDropdown
            issueKey={issueKey}
            projectKey={projectKey}
            versionName={versionName}
            currentStatus={detail.status}
          />
        )}
        {detail.priority && (
          <span className={cn("rounded px-2 py-0.5 text-xs font-medium", priorityClass(detail.priority))}>
            {detail.priority}
          </span>
        )}
        {detail.assignee && (
          <span className="flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <User className="h-3 w-3" />
            {detail.assignee}
          </span>
        )}
      </div>

      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Description</p>
        {hasDescription ? (
          <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800">
            {detail.description_blocks.map((block, i) => {
              if (block.type === "text") {
                return (
                  <p key={i} className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">
                    {block.content}
                  </p>
                );
              }
              const att = attachmentByFilename.get(block.filename);
              return att ? (
                <div key={i} className="py-1">
                  <AttachmentPreview attachment={att} inline />
                </div>
              ) : null;
            })}
          </div>
        ) : (
          <p className="text-sm italic text-slate-400">No description.</p>
        )}
      </div>

      {remainingAttachments.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Attachments ({remainingAttachments.length})
          </p>
          <div className="flex flex-wrap gap-3">
            {remainingAttachments.map((att) => (
              <AttachmentPreview key={att.id} attachment={att} />
            ))}
          </div>
        </div>
      )}

      {detail.comments.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Comments ({detail.comments.length})
          </p>
          <div className="space-y-2">
            {detail.comments.map((c) => (
              <CommentItem key={c.id} comment={c} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── IssueDetailModal ───────────────────────────────────────────────────────────

export function IssueDetailModal({
  issueKey,
  projectKey,
  versionName,
  onClose,
}: {
  issueKey: string;
  projectKey: string;
  versionName: string;
  onClose: () => void;
}) {
  const { data: detail, isLoading, isError } = useIssueDetail(issueKey);

  const [commentText, setCommentText] = useState("");
  const { mutate: addComment, isPending: commentPending, isSuccess: commentSent, reset: resetComment } = useAddJiraComment();
  const commentRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (commentSent) {
      setCommentText("");
      resetComment();
    }
  }, [commentSent, resetComment]);

  function submitComment() {
    const body = commentText.trim();
    if (!body) return;
    addComment({ issueKey, body });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-700">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-900/30">
              <FileText className="h-4 w-4 text-indigo-500 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {isLoading ? "Loading…" : detail?.summary ?? issueKey}
              </h2>
              <p className="font-mono text-xs text-slate-400">{issueKey}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading issue details…
            </div>
          )}
          {isError && (
            <p className="text-sm text-red-500">Failed to load issue details.</p>
          )}
          {detail && (
            <IssueDetailContent
              detail={detail}
              issueKey={issueKey}
              projectKey={projectKey}
              versionName={versionName}
            />
          )}
        </div>

        <div className="shrink-0 border-t border-slate-100 px-5 py-3 dark:border-slate-700">
          <textarea
            ref={commentRef}
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitComment();
            }}
            placeholder="Add a comment… (⌘↵ to send)"
            rows={2}
            className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 placeholder-slate-400 outline-none focus:border-indigo-400 focus:bg-white dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:placeholder-slate-500 dark:focus:border-indigo-500 dark:focus:bg-slate-900"
          />
          <div className="mt-2 flex justify-end">
            <button
              onClick={submitComment}
              disabled={!commentText.trim() || commentPending}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-40 dark:bg-indigo-500 dark:hover:bg-indigo-600"
            >
              {commentPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              Comment
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
