import { useState, useRef, useEffect, useCallback } from "react";
import { open as openFilePicker } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  X,
  Bug,
  Paperclip,
  Search,
  CheckCircle2,
  AlertTriangle,
  ImageIcon,
  FileVideo,
  Trash2,
  Loader2,
  ChevronDown,
  User,
} from "lucide-react";
import { cn } from "@/components/ui/utils";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useProjectComponents, useSearchUsers, useCreateBug, useProjectVersions } from "@/services/queries";
import type { JiraVersion } from "@/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"]);
const VIDEO_EXTS = new Set(["mp4", "mov", "avi", "mkv", "webm"]);

function fileExt(path: string): string {
  return path.split(".").pop()?.toLowerCase() ?? "";
}

function isImage(path: string): boolean {
  return IMAGE_EXTS.has(fileExt(path));
}

function isVideo(path: string): boolean {
  return VIDEO_EXTS.has(fileExt(path));
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

// ── Component selector ────────────────────────────────────────────────────────

interface ComponentSelectorProps {
  projectKey: string;
  value: string; // component id
  onChange: (id: string, name: string) => void;
}

function ComponentSelector({ projectKey, value, onChange }: ComponentSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const { data: components, isLoading } = useProjectComponents(projectKey);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const filtered = (components ?? []).filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()),
  );

  const selected = (components ?? []).find((c) => c.id === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors",
          "border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-500",
          open && "border-slate-400 dark:border-slate-400",
        )}
      >
        <span className={selected ? "text-slate-800 dark:text-slate-100" : "text-slate-400 dark:text-slate-500"}>
          {selected ? selected.name : "No component"}
        </span>
        {isLoading ? (
          <Spinner size="sm" />
        ) : (
          <ChevronDown className={cn("h-4 w-4 text-slate-400 transition-transform", open && "rotate-180")} />
        )}
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-600 dark:bg-slate-800">
          <div className="border-b border-slate-100 p-2 dark:border-slate-700">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                placeholder="Search components…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-slate-50 py-1.5 pl-7 pr-3 text-xs outline-none focus:border-slate-400 focus:bg-white dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto">
            <button
              type="button"
              onClick={() => { onChange("", ""); setOpen(false); }}
              className="flex w-full items-center px-3 py-2 text-sm text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              No component
            </button>
            {filtered.length === 0 && search && (
              <p className="px-3 py-2 text-xs text-slate-400">No matches.</p>
            )}
            {filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => { onChange(c.id, c.name); setOpen(false); setSearch(""); }}
                className={cn(
                  "flex w-full items-center px-3 py-2 text-sm transition-colors",
                  c.id === value
                    ? "bg-slate-100 font-medium text-slate-900 dark:bg-slate-700 dark:text-slate-100"
                    : "text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700",
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Assignee search ───────────────────────────────────────────────────────────

interface AssigneeSelectorProps {
  value: { accountId: string; displayName: string } | null;
  onChange: (user: { accountId: string; displayName: string } | null) => void;
}

function AssigneeSelector({ value, onChange }: AssigneeSelectorProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data: results, isFetching } = useSearchUsers(query.length >= 1 ? query : "");

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {value ? (
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-slate-400" />
            <span className="text-sm text-slate-800 dark:text-slate-100">{value.displayName}</span>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            placeholder="Search by name or email…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm text-slate-700 outline-none focus:border-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:focus:border-slate-400"
          />
          {isFetching && (
            <Spinner size="sm" className="absolute right-2.5 top-1/2 -translate-y-1/2" />
          )}
        </div>
      )}

      {open && !value && (results?.length ?? 0) > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-600 dark:bg-slate-800">
          {results!.map((u) => (
            <button
              key={u.account_id}
              type="button"
              onClick={() => { onChange({ accountId: u.account_id, displayName: u.display_name }); setQuery(""); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              {u.avatar_urls?.["48x48"] ? (
                <img src={u.avatar_urls["48x48"]} alt="" className="h-6 w-6 rounded-full" />
              ) : (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-600">
                  <User className="h-3.5 w-3.5 text-slate-500" />
                </div>
              )}
              <span className="text-slate-700 dark:text-slate-200">{u.display_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Attachment preview item ───────────────────────────────────────────────────

function AttachmentItem({ path, onRemove }: { path: string; onRemove: () => void }) {
  const name = fileName(path);
  const img = isImage(path);
  const vid = isVideo(path);
  const assetUrl = convertFileSrc(path);

  return (
    <div className="group relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
      {img ? (
        <img
          src={assetUrl}
          alt={name}
          className="h-24 w-full object-cover"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      ) : vid ? (
        <video
          src={assetUrl}
          className="h-24 w-full object-cover"
          muted
          preload="metadata"
        />
      ) : (
        <div className="flex h-24 items-center justify-center">
          {img ? <ImageIcon className="h-8 w-8 text-slate-300" /> : <FileVideo className="h-8 w-8 text-slate-300" />}
        </div>
      )}
      <div className="flex items-center justify-between gap-1 border-t border-slate-100 px-2 py-1 dark:border-slate-700">
        <span className="max-w-[110px] truncate text-[10px] text-slate-500 dark:text-slate-400" title={name}>
          {name}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 rounded p-0.5 text-slate-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 dark:hover:bg-red-900/30"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export interface CreateBugModalProps {
  open: boolean;
  onClose: () => void;
  projectKey: string;
  /** When provided, the version is pre-selected and the picker is hidden. */
  version?: JiraVersion;
  /** Pre-fill the description field (e.g. with failed step info). */
  prefillDescription?: string;
  /** Called after a bug is successfully created, with the new issue key. */
  onBugCreated?: (bugKey: string) => void;
}

export function CreateBugModal({
  open,
  onClose,
  projectKey,
  version: fixedVersion,
  prefillDescription,
  onBugCreated,
}: CreateBugModalProps) {
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [componentId, setComponentId] = useState("");
  const [assignee, setAssignee] = useState<{ accountId: string; displayName: string } | null>(null);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string>("");
  const summaryRef = useRef<HTMLInputElement>(null);

  const createBug = useCreateBug();
  const { data: versions } = useProjectVersions(!fixedVersion ? projectKey : null);

  // The effective version: either the fixed prop or the user-selected one.
  const effectiveVersion = fixedVersion ?? (versions ?? []).find((v) => v.id === selectedVersionId);

  // Focus summary on open; reset on close
  useEffect(() => {
    if (open) {
      setCreatedKey(null);
      setDescription(prefillDescription ?? "");
      setTimeout(() => summaryRef.current?.focus(), 50);
    } else {
      setSummary("");
      setDescription("");
      setComponentId("");
      setAssignee(null);
      setAttachments([]);
      setCreatedKey(null);
      setSelectedVersionId("");
      createBug.reset();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePickFiles = useCallback(async () => {
    const result = await openFilePicker({
      multiple: true,
      title: "Select images or videos to attach",
      filters: [
        {
          name: "Images & Videos",
          extensions: ["jpg", "jpeg", "png", "gif", "webp", "bmp", "mp4", "mov", "avi", "mkv", "webm"],
        },
      ],
    });
    if (!result) return;
    const paths = Array.isArray(result) ? result : [result];
    setAttachments((prev) => {
      const existing = new Set(prev);
      return [...prev, ...paths.filter((p) => !existing.has(p))];
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!summary.trim() || !effectiveVersion) return;
    const vars: Parameters<typeof createBug.mutateAsync>[0] = {
      projectKey,
      versionName: effectiveVersion.name,
      summary: summary.trim(),
      affectedVersionId: effectiveVersion.id,
      attachmentPaths: attachments,
    };
    if (description.trim()) vars.description = description.trim();
    if (componentId) vars.componentId = componentId;
    if (assignee?.accountId) {
      vars.assigneeAccountId = assignee.accountId;
      vars.assigneeDisplayName = assignee.displayName;
    }
    const result = await createBug.mutateAsync(vars);
    setCreatedKey(result.key);
    onBugCreated?.(result.key);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-700">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 dark:bg-red-900/30">
              <Bug className="h-4 w-4 text-red-500 dark:text-red-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Create Bug</h2>
              {effectiveVersion ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Affected version:{" "}
                  <span className="font-medium text-slate-700 dark:text-slate-200">{effectiveVersion.name}</span>
                </p>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Select a version below
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Success state */}
        {createdKey ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 py-10">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-900/30">
              <CheckCircle2 className="h-7 w-7 text-emerald-500" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-slate-800 dark:text-slate-100">Bug created!</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Issue key:{" "}
                <span className="font-mono font-bold text-slate-700 dark:text-slate-200">
                  {createdKey}
                </span>
              </p>
              {attachments.length > 0 && (
                <p className="mt-0.5 text-xs text-slate-400">
                  {attachments.length} attachment{attachments.length !== 1 ? "s" : ""} uploaded
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setCreatedKey(null);
                  setSummary("");
                  setDescription("");
                  setComponentId("");
                  setAssignee(null);
                  setAttachments([]);
                  createBug.reset();
                }}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Create another
              </button>
              <button
                onClick={onClose}
                className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {/* Summary */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Summary <span className="text-red-500">*</span>
                </label>
                <Input
                  ref={summaryRef}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Short description of the bug…"
                  required
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Steps to reproduce, expected vs actual behaviour…"
                  rows={4}
                  className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:placeholder-slate-500 dark:focus:border-slate-400"
                />
              </div>

              {/* Version picker — only shown when no fixed version */}
              {!fixedVersion && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Affected Version <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={selectedVersionId}
                    onChange={(e) => setSelectedVersionId(e.target.value)}
                    className={cn(
                      "w-full rounded-lg border px-3 py-2 text-sm transition-colors outline-none",
                      "border-slate-200 bg-white text-slate-700 hover:border-slate-300 focus:border-slate-400",
                      "dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-500 dark:focus:border-slate-400",
                      !selectedVersionId && "text-slate-400 dark:text-slate-500",
                    )}
                  >
                    <option value="">Select a version…</option>
                    {(versions ?? []).map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}{v.released ? " (released)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Component + Assignee row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Component
                  </label>
                  <ComponentSelector
                    projectKey={projectKey}
                    value={componentId}
                    onChange={(id) => setComponentId(id)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Assignee
                  </label>
                  <AssigneeSelector value={assignee} onChange={setAssignee} />
                </div>
              </div>

              {/* Attachments */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Attachments
                    {attachments.length > 0 && (
                      <span className="ml-1.5 rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-400">
                        {attachments.length}
                      </span>
                    )}
                  </label>
                  <button
                    type="button"
                    onClick={() => void handlePickFiles()}
                    className="flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-500 hover:border-slate-400 hover:bg-slate-50 dark:border-slate-600 dark:hover:border-slate-500 dark:hover:bg-slate-800"
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                    Add files
                  </button>
                </div>

                {attachments.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2">
                    {attachments.map((path) => (
                      <AttachmentItem
                        key={path}
                        path={path}
                        onRemove={() => setAttachments((prev) => prev.filter((p) => p !== path))}
                      />
                    ))}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handlePickFiles()}
                    className="flex w-full flex-col items-center gap-1.5 rounded-lg border border-dashed border-slate-200 py-5 text-slate-400 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:border-slate-600 dark:hover:bg-slate-800/50"
                  >
                    <Paperclip className="h-5 w-5 opacity-40" />
                    <span className="text-xs">Click to attach images or videos</span>
                  </button>
                )}
              </div>

              {/* Error */}
              {createBug.isError && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{createBug.error.message}</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex shrink-0 items-center justify-between border-t border-slate-100 px-5 py-3 dark:border-slate-700">
              <div className="flex items-center gap-1.5">
                {effectiveVersion && (
                  <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    {effectiveVersion.name}
                  </span>
                )}
                {attachments.length > 0 && (
                  <span className="text-[10px] text-slate-400">
                    + {attachments.length} file{attachments.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!summary.trim() || !effectiveVersion || createBug.isPending}
                  className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 dark:bg-red-700 dark:hover:bg-red-600"
                >
                  {createBug.isPending ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Creating…
                    </>
                  ) : (
                    <>
                      <Bug className="h-3.5 w-3.5" />
                      Create Bug
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
