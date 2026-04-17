import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { open as openFilePicker } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  AlertTriangle,
  CheckCircle,
  CheckCircle2,
  Clock,
  Loader2,
  MessageSquarePlus,
  Paperclip,
  Send,
  Trash2,
  User,
  ChevronDown,
} from "lucide-react";
import {
  useVersionIssues,
  useIssueTransitions,
  useTransitionIssue,
  useAddJiraComment,
} from "@/services/queries";
import { cn } from "@/components/ui/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { priorityClass, statusCategoryClass, attachIsImg, attachIsVid, attachName } from "./utils";
import { IssueDetailModal } from "./IssueDetailModal";
import type { JiraBug, JiraTransition } from "@/types";

// ── VersionIssueRow ────────────────────────────────────────────────────────────

function VersionIssueRow({
  issue,
  projectKey,
  versionName,
}: {
  issue: JiraBug;
  projectKey: string;
  versionName: string;
}) {
  const typeName = issue.fields.issue_type?.name ?? "";

  const [detailOpen, setDetailOpen] = useState(false);

  const [menuOpen, setMenuOpen] = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0 });
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuDropRef = useRef<HTMLDivElement>(null);
  const { data: transitions, isLoading: transitionsLoading } = useIssueTransitions(
    menuOpen ? issue.key : null,
  );
  const { mutate: transitionIssue, isPending: transitioning } = useTransitionIssue();

  const calcMenuPos = useCallback(() => {
    if (!menuButtonRef.current) return;
    const r = menuButtonRef.current.getBoundingClientRect();
    setDropPos({ top: r.bottom + 4, left: r.right - 160 }); // align right edge
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuButtonRef.current?.contains(target) || menuDropRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  function applyTransition(t: JiraTransition) {
    transitionIssue(
      { issueKey: issue.key, transitionId: t.id, executionProjectKey: projectKey, versionName },
      { onSettled: () => setMenuOpen(false) },
    );
  }

  const [commentOpen, setCommentOpen] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const { mutate: addComment, isPending: commentPending, reset: resetComment } = useAddJiraComment();

  useEffect(() => {
    if (commentOpen) {
      setTimeout(() => commentRef.current?.focus(), 50);
    } else {
      setCommentText("");
      setAttachments([]);
      resetComment();
    }
  }, [commentOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  async function pickFiles() {
    const result = await openFilePicker({
      multiple: true,
      title: "Select images or videos",
      filters: [{ name: "Images & Videos", extensions: ["jpg", "jpeg", "png", "gif", "webp", "bmp", "mp4", "mov", "avi", "mkv", "webm"] }],
    });
    if (!result) return;
    const paths = Array.isArray(result) ? result : [result];
    setAttachments((prev) => {
      const seen = new Set(prev);
      return [...prev, ...paths.filter((p) => !seen.has(p))];
    });
  }

  function submitComment() {
    const body = commentText.trim();
    if (!body) return;
    addComment(
      { issueKey: issue.key, body, attachmentPaths: attachments },
      { onSuccess: () => setCommentOpen(false) },
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white transition-colors hover:border-indigo-400 hover:bg-indigo-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-indigo-500 dark:hover:bg-indigo-900/40">
      <div className="flex items-start gap-3 px-3 py-2.5">
        <span
          className={cn("mt-0.5 shrink-0 font-bold leading-none", priorityClass(issue.fields.priority?.name))}
          title={issue.fields.priority?.name ?? "No priority"}
        >
          ●
        </span>

        <button
          className="min-w-0 flex-1 text-left"
          onClick={() => setDetailOpen(true)}
          title="View issue details"
        >
          <p className="truncate text-sm text-slate-800 dark:text-slate-200">{issue.fields.summary}</p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <p className="font-mono text-xs text-slate-400">{issue.key}</p>
            {typeName && (
              <span className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-[10px] font-medium text-slate-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300">
                {typeName}
              </span>
            )}
          </div>
        </button>

        {issue.fields.assignee && (
          <span className="flex shrink-0 items-center gap-1 text-xs text-slate-400">
            <User className="h-3 w-3" />
            {issue.fields.assignee.display_name}
          </span>
        )}

        <button
          onClick={() => setCommentOpen((o) => !o)}
          title="Add comment"
          className={cn(
            "shrink-0 rounded p-1 transition-colors",
            commentOpen
              ? "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
              : "text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300",
          )}
        >
          <MessageSquarePlus className="h-3.5 w-3.5" />
        </button>

        {issue.fields.status && (
          <div className="shrink-0">
            <button
              ref={menuButtonRef}
              onClick={() => { calcMenuPos(); setMenuOpen((o) => !o); }}
              disabled={transitioning}
              title="Change status"
              className={cn(
                "flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-opacity",
                statusCategoryClass(issue.fields.status.category?.key),
                "hover:opacity-80",
                transitioning && "opacity-50",
              )}
            >
              {transitioning ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <ChevronDown className="h-2.5 w-2.5" />}
              {issue.fields.status.name}
            </button>

            {menuOpen && createPortal(
              <div
                ref={menuDropRef}
                style={{ position: "fixed", top: dropPos.top, left: dropPos.left, zIndex: 9999 }}
                className="min-w-[160px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800"
              >
                {transitionsLoading ? (
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
                          onClick={() => applyTransition(t)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700"
                        >
                          <span className={cn("h-2 w-2 shrink-0 rounded-full",
                            t.to.category?.key === "done" ? "bg-emerald-500"
                            : t.to.category?.key === "indeterminate" ? "bg-blue-500"
                            : "bg-slate-400"
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
          </div>
        )}
      </div>

      {detailOpen && (
        <IssueDetailModal
          issueKey={issue.key}
          projectKey={projectKey}
          versionName={versionName}
          onClose={() => setDetailOpen(false)}
        />
      )}

      {commentOpen && (
        <div className="border-t border-slate-100 px-3 pb-3 pt-2 dark:border-slate-700">
          <textarea
            ref={commentRef}
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitComment();
              if (e.key === "Escape") setCommentOpen(false);
            }}
            placeholder="Add a comment… (⌘↵ to send)"
            rows={3}
            className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 placeholder-slate-400 outline-none focus:border-slate-400 focus:bg-white dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:placeholder-slate-500 dark:focus:border-slate-500 dark:focus:bg-slate-800"
          />

          {attachments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {attachments.map((path) => {
                const name = attachName(path);
                const src = convertFileSrc(path);
                return (
                  <div
                    key={path}
                    title={name}
                    className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
                  >
                    {attachIsImg(path) ? (
                      <img src={src} alt={name} className="h-full w-full object-cover" />
                    ) : attachIsVid(path) ? (
                      <video src={src} className="h-full w-full object-cover" muted preload="metadata" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[10px] text-slate-400">{name}</div>
                    )}
                    <button
                      type="button"
                      onClick={() => setAttachments((prev) => prev.filter((p) => p !== path))}
                      className="absolute right-0.5 top-0.5 rounded bg-black/50 p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <Trash2 className="h-2.5 w-2.5 text-white" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => void pickFiles()}
              className="flex items-center gap-1.5 rounded border border-dashed border-slate-300 px-2 py-1 text-xs text-slate-500 hover:border-slate-400 hover:bg-slate-50 dark:border-slate-600 dark:hover:border-slate-500 dark:hover:bg-slate-800"
            >
              <Paperclip className="h-3 w-3" />
              Attach
              {attachments.length > 0 && (
                <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-400">
                  {attachments.length}
                </span>
              )}
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCommentOpen(false)}
                className="rounded px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={submitComment}
                disabled={!commentText.trim() || commentPending}
                className="flex items-center gap-1.5 rounded bg-slate-800 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-slate-300"
              >
                {commentPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                Comment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── VersionIssuesPanel ─────────────────────────────────────────────────────────

interface VersionIssuesPanelProps {
  projectKey: string;
  versionName: string;
}

export function VersionIssuesPanel({ projectKey, versionName }: VersionIssuesPanelProps) {
  const { data: issues, isLoading, isError, error } = useVersionIssues(projectKey, versionName);

  const { done, inAcceptance, blocked } = useMemo(() => {
    const list = issues ?? [];
    const done: JiraBug[] = [];
    const inAcceptance: JiraBug[] = [];
    const blocked: JiraBug[] = [];
    for (const issue of list) {
      const categoryKey = issue.fields.status?.category?.key ?? "";
      const statusName = issue.fields.status?.name ?? "";
      if (categoryKey === "done") {
        done.push(issue);
      } else if (/acceptance/i.test(statusName)) {
        inAcceptance.push(issue);
      } else if (/block/i.test(statusName)) {
        blocked.push(issue);
      }
    }
    return { done, inAcceptance, blocked };
  }, [issues]);

  if (isLoading) {
    return (
      <div className="mt-4 overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-sm dark:border-indigo-900/60 dark:bg-slate-800">
        <div className="flex items-center gap-1.5 bg-indigo-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-indigo-500 dark:bg-indigo-950/60 dark:text-indigo-400">
          <CheckCircle className="h-3.5 w-3.5" />
          Stories &amp; Tasks
        </div>
        <div className="space-y-1.5 p-4">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading version issues…</span>
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded border border-slate-100 px-3 py-2 dark:border-slate-700"
            >
              <Skeleton className="h-4 w-16 shrink-0" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mt-4 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
        Failed to load version issues: {String(error)}
      </div>
    );
  }

  const list = issues ?? [];

  if (list.length === 0) {
    return (
      <div className="mt-4 overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-sm dark:border-indigo-900/60 dark:bg-slate-800">
        <div className="flex items-center gap-1.5 bg-indigo-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-indigo-500 dark:bg-indigo-950/60 dark:text-indigo-400">
          <CheckCircle className="h-3.5 w-3.5" />
          Stories &amp; Tasks
        </div>
        <p className="p-4 text-xs italic text-slate-400">
          No stories, tasks, or bugs found for this version.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-sm dark:border-indigo-900/60 dark:bg-slate-800">
      <div className="flex items-center justify-between bg-indigo-50 px-4 py-2.5 dark:bg-indigo-950/60">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-indigo-500 dark:text-indigo-400">
          <CheckCircle className="h-3.5 w-3.5" />
          Stories &amp; Tasks ({list.length})
        </div>
        {blocked.length > 0 && (
          <span className="flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
            <AlertTriangle className="h-3 w-3" />
            {blocked.length} blocked
          </span>
        )}
      </div>

      <div className="p-4">
        {/* Blocked — highest urgency, shown first */}
        {blocked.length > 0 && (
          <div className="mb-3">
            <div className="mb-1.5 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
              <span className="text-xs font-semibold text-red-600 dark:text-red-400">
                Blocked ({blocked.length})
              </span>
            </div>
            <div className="space-y-1.5">
              {blocked.map((issue) => (
                <VersionIssueRow
                  key={issue.id}
                  issue={issue}
                  projectKey={projectKey}
                  versionName={versionName}
                />
              ))}
            </div>
          </div>
        )}

        {inAcceptance.length > 0 && (
          <div className={cn(blocked.length > 0 && "mt-3")}>
            <div className="mb-1.5 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                In Acceptance Testing ({inAcceptance.length})
              </span>
            </div>
            <div className="space-y-1.5">
              {inAcceptance.map((issue) => (
                <VersionIssueRow
                  key={issue.id}
                  issue={issue}
                  projectKey={projectKey}
                  versionName={versionName}
                />
              ))}
            </div>
          </div>
        )}

        {done.length > 0 && (
          <div className={cn((inAcceptance.length > 0 || blocked.length > 0) && "mt-3")}>
            <div className="mb-1.5 flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                Done ({done.length})
              </span>
            </div>
            <div className="space-y-1.5">
              {done.map((issue) => (
                <VersionIssueRow
                  key={issue.id}
                  issue={issue}
                  projectKey={projectKey}
                  versionName={versionName}
                />
              ))}
            </div>
          </div>
        )}

        {list.length > done.length + inAcceptance.length + blocked.length && (
          <div className={cn(done.length + inAcceptance.length + blocked.length > 0 && "mt-3")}>
            <div className="mb-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
              In Progress / Other ({list.length - done.length - inAcceptance.length - blocked.length})
            </div>
            <div className="space-y-1.5">
              {list
                .filter((issue) => {
                  const categoryKey = issue.fields.status?.category?.key ?? "";
                  const statusName = issue.fields.status?.name ?? "";
                  return (
                    categoryKey !== "done" &&
                    !/acceptance/i.test(statusName) &&
                    !/block/i.test(statusName)
                  );
                })
                .map((issue) => (
                  <VersionIssueRow
                    key={issue.id}
                    issue={issue}
                    projectKey={projectKey}
                    versionName={versionName}
                  />
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
