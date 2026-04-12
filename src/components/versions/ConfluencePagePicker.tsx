/**
 * Inline wizard for choosing where to create a Confluence page.
 *
 * Flow:
 * 1. Pick a space (searchable list — personal spaces filtered out)
 * 2. Browse page tree with breadcrumb navigation
 * 3. Confirm — page is created at the current location
 */
import { useState, useMemo } from "react";
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  FolderOpen,
  Home,
  Loader2,
  Search,
  X,
} from "lucide-react";

import {
  useConfluenceSpaces,
  useConfluenceChildren,
  useCreateConfluencePage,
} from "@/services/queries";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { JiraVersion } from "@/types";

interface BreadcrumbItem {
  id: string;
  title: string;
  /** `"page"` or `"folder"` — needed to call the correct children endpoint. */
  contentType: string;
}

export interface ConfluencePagePickerProps {
  version: JiraVersion;
  onCreated: (
    pageId: string,
    spaceId: string,
    parentId: string | null,
    webUrl: string | null,
    pageTitle: string,
  ) => void;
  onCancel?: () => void;
}

export function ConfluencePagePicker({
  version,
  onCreated,
  onCancel,
}: ConfluencePagePickerProps) {
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [spaceName, setSpaceName] = useState("");
  const [homepageId, setHomepageId] = useState<string | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([]);
  const [spaceSearch, setSpaceSearch] = useState("");
  const [pageSearch, setPageSearch] = useState("");

  // Current parent: last breadcrumb item, or homepage for root
  const currentParent = breadcrumb.at(-1);
  const currentParentId = currentParent?.id ?? homepageId ?? undefined;
  const currentParentType = currentParent?.contentType ?? "page";

  const { data: spaces, isLoading: spacesLoading } = useConfluenceSpaces(true);
  const { data: children, isLoading: childrenLoading } = useConfluenceChildren(
    currentParentId,
    currentParentType,
  );
  const createPage = useCreateConfluencePage();

  // Filter out personal spaces client-side
  const filteredSpaces = useMemo(() => {
    const nonPersonal = (spaces ?? []).filter(
      (s) => s.spaceType !== "personal" && !s.key.startsWith("~"),
    );
    const q = spaceSearch.trim().toLowerCase();
    if (!q) return nonPersonal;
    return nonPersonal.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.key.toLowerCase().includes(q),
    );
  }, [spaces, spaceSearch]);

  const filteredChildren = useMemo(() => {
    const q = pageSearch.trim().toLowerCase();
    return (children ?? []).filter(
      (c) => !q || c.title.toLowerCase().includes(q),
    );
  }, [children, pageSearch]);

  const navigateInto = (
    id: string,
    title: string,
    contentType: string,
  ) => {
    setBreadcrumb((prev) => [...prev, { id, title, contentType }]);
    setPageSearch("");
  };

  const navigateToBreadcrumb = (index: number) => {
    // index -1 = space root
    setBreadcrumb((prev) => prev.slice(0, index + 1));
    setPageSearch("");
  };

  const handleCreate = () => {
    if (!spaceId) return;
    const parentId = currentParentId ?? null;
    const title = `QA Feedback \u2014 ${version.name}`;
    const body = buildTemplate(version);
    createPage.mutate(
      { spaceId, parentId, parentType: currentParentType, title, body },
      {
        onSuccess: (page) => {
          onCreated(page.id, spaceId, parentId, page.web_url, page.title);
        },
      },
    );
  };

  const isCreating = createPage.isPending;

  // ── Step 1: Space selection ──────────────────────────────
  if (!spaceId) {
    return (
      <div className="flex h-full flex-col gap-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Choose a Confluence Space
            </span>
          </div>
          {onCancel && (
            <button
              onClick={onCancel}
              className="rounded p-1 text-slate-400 hover:bg-slate-100
                hover:text-slate-600 dark:hover:bg-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <p className="text-xs text-slate-400 dark:text-slate-500">
          Select the space where the feedback page for{" "}
          <span className="font-medium text-slate-600 dark:text-slate-300">
            {version.name}
          </span>{" "}
          will be created.
        </p>

        {/* Search */}
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
          <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <input
            autoCorrect="off" autoCapitalize="off" spellCheck={false}
            type="text"
            placeholder="Search spaces\u2026"
            value={spaceSearch}
            onChange={(e) => setSpaceSearch(e.target.value)}
            className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none dark:text-slate-200"
            autoFocus
          />
          {spaceSearch && (
            <button
              onClick={() => setSpaceSearch("")}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Space list */}
        <div className="flex-1 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
          {spacesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner size="sm" />
            </div>
          ) : filteredSpaces.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <FolderOpen className="h-6 w-6 text-slate-300 dark:text-slate-600" />
              <p className="text-sm text-slate-400">
                {(spaces ?? []).length === 0
                  ? "No project spaces found."
                  : "No spaces match your search."}
              </p>
            </div>
          ) : (
            filteredSpaces.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setSpaceId(s.id);
                  setSpaceName(s.name);
                  setHomepageId(s.homepageId ?? null);
                  setSpaceSearch("");
                }}
                className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
              >
                <FolderOpen className="h-4 w-4 shrink-0 text-blue-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                    {s.name}
                  </p>
                </div>
                <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  {s.key}
                </span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300 dark:text-slate-600" />
              </button>
            ))
          )}
        </div>
      </div>
    );
  }

  // ── Step 2: Page browser with breadcrumbs ─────────────────
  const locationLabel =
    breadcrumb.length > 0
      ? `${spaceName} / ${breadcrumb.map((b) => b.title).join(" / ")}`
      : `${spaceName} (root)`;

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (breadcrumb.length > 0) {
                setBreadcrumb((prev) => prev.slice(0, -1));
                setPageSearch("");
              } else {
                setSpaceId(null);
                setSpaceName("");
                setHomepageId(null);
                setBreadcrumb([]);
                setPageSearch("");
                createPage.reset();
              }
            }}
            disabled={isCreating}
            className="rounded p-1 text-slate-400 hover:bg-slate-100
              hover:text-slate-600 dark:hover:bg-slate-700"
            title={breadcrumb.length > 0 ? "Go up" : "Back to spaces"}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <FolderOpen className="h-4 w-4 text-blue-500" />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {spaceName}
          </span>
        </div>
        {onCancel && (
          <button
            onClick={onCancel}
            disabled={isCreating}
            className="rounded p-1 text-slate-400 hover:bg-slate-100
              hover:text-slate-600 dark:hover:bg-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center gap-1 text-xs">
        <button
          onClick={() => navigateToBreadcrumb(-1)}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-slate-500
            hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400
            dark:hover:bg-slate-700 dark:hover:text-slate-200"
        >
          <Home className="h-3 w-3" />
          {spaceName}
        </button>
        {breadcrumb.map((item, i) => (
          <span key={item.id} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3 text-slate-300 dark:text-slate-600" />
            <button
              onClick={() => navigateToBreadcrumb(i)}
              className={`rounded px-1.5 py-0.5 ${
                i === breadcrumb.length - 1
                  ? "font-medium text-blue-600 dark:text-blue-400"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
              }`}
            >
              {item.title}
            </button>
          </span>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 rounded-lg border border-slate-200
        bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
        <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <input
          autoCorrect="off" autoCapitalize="off" spellCheck={false}
          type="text"
          placeholder="Search pages\u2026"
          value={pageSearch}
          onChange={(e) => setPageSearch(e.target.value)}
          className="w-full bg-transparent text-sm text-slate-700
            placeholder:text-slate-400 focus:outline-none dark:text-slate-200"
        />
        {pageSearch && (
          <button
            onClick={() => setPageSearch("")}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Content list (pages + folders) */}
      <div className="flex-1 overflow-y-auto rounded-lg border border-slate-200
        dark:border-slate-700">
        {childrenLoading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="sm" />
          </div>
        ) : filteredChildren.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-400">
            {(children ?? []).length === 0
              ? "No child pages or folders here."
              : "No items match your search."}
          </p>
        ) : (
          filteredChildren.map((c) => (
            <button
              key={c.id}
              onClick={() => navigateInto(c.id, c.title, c.contentType)}
              className="flex w-full items-center gap-3 border-b border-slate-100
                px-4 py-2.5 text-left transition-colors last:border-b-0
                hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
            >
              {c.contentType === "folder" ? (
                <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-500" />
              ) : (
                <BookOpen className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              )}
              <span className="flex-1 truncate text-sm text-slate-700
                dark:text-slate-200">
                {c.title}
              </span>
              {c.contentType === "folder" && (
                <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5
                  text-[10px] font-medium text-amber-600 dark:bg-amber-950
                  dark:text-amber-400">
                  Folder
                </span>
              )}
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300
                dark:text-slate-600" />
            </button>
          ))
        )}
      </div>

      {/* Summary + action */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3
        dark:border-slate-700 dark:bg-slate-900/50">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Page:{" "}
          <span className="font-medium text-slate-800 dark:text-slate-100">
            QA Feedback &mdash; {version.name}
          </span>
        </p>
        <p className="mt-0.5 text-xs text-slate-400">
          in {locationLabel}
        </p>
      </div>

      {/* Error */}
      {createPage.isError && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2
          text-sm text-red-700 dark:border-red-800 dark:bg-red-950
          dark:text-red-300">
          {String(createPage.error)}
        </p>
      )}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="outline" onClick={onCancel} disabled={isCreating}>
            Cancel
          </Button>
        )}
        <Button onClick={handleCreate} disabled={isCreating}>
          {isCreating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Creating&hellip;
            </>
          ) : (
            "Create Here"
          )}
        </Button>
      </div>
    </div>
  );
}

// ── Template ──────────────────────────────────────────────────────────────────

function buildTemplate(version: JiraVersion): string {
  const released = version.released ? "Released" : "Unreleased";
  const date =
    version.release_date ??
    version.start_date ??
    new Date().toISOString().slice(0, 10);

  return `<h2>Version Info</h2>
<table data-layout="default">
  <colgroup><col style="width:200px"/><col style="width:400px"/></colgroup>
  <tbody>
    <tr><th><p><strong>Name</strong></p></th><td><p>${escHtml(version.name)}</p></td></tr>
    <tr><th><p><strong>Status</strong></p></th><td><p>${released}</p></td></tr>
    <tr><th><p><strong>Date</strong></p></th><td><p>${escHtml(date)}</p></td></tr>
  </tbody>
</table>

<h2>Issues</h2>
<table data-layout="full-width">
  <colgroup>
    <col style="width:220px"/>
    <col style="width:160px"/>
    <col style="width:90px"/>
    <col style="width:120px"/>
    <col style="width:130px"/>
    <col style="width:80px"/>
  </colgroup>
  <thead>
    <tr>
      <th><p><strong>Description</strong></p></th>
      <th><p><strong>Comment</strong></p></th>
      <th><p><strong>Priority</strong></p></th>
      <th><p><strong>Jira Ticket</strong></p></th>
      <th><p><strong>Assigned Developer</strong></p></th>
      <th><p><strong>Status</strong></p></th>
    </tr>
  </thead>
  <tbody>
  </tbody>
</table>`;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
