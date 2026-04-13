/**
 * Inline wizard for linking an already-existing Confluence page.
 *
 * Flow:
 * 1. Pick a space (searchable list — personal spaces filtered out)
 * 2. Browse page tree with breadcrumb navigation
 * 3. Click a page to select it — the page is linked (not created)
 *
 * Similar to ConfluencePagePicker but selects an existing page
 * instead of creating a new one.
 */
import { useState, useMemo } from "react";
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronRight,
  FolderOpen,
  Home,
  Link2,
  Loader2,
  Search,
  X,
} from "lucide-react";

import {
  useConfluenceSpaces,
  useConfluenceChildren,
} from "@/services/queries";
import { getConfluencePage } from "@/services/tauri";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

interface BreadcrumbItem {
  id: string;
  title: string;
  contentType: string;
}

export interface ConfluencePageLinkerProps {
  onLinked: (
    pageId: string,
    spaceId: string,
    parentId: string | null,
    webUrl: string | null,
    pageTitle: string,
  ) => void;
  onCancel?: () => void;
}

export function ConfluencePageLinker({
  onLinked,
  onCancel,
}: ConfluencePageLinkerProps) {
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [spaceName, setSpaceName] = useState("");
  const [homepageId, setHomepageId] = useState<string | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([]);
  const [spaceSearch, setSpaceSearch] = useState("");
  const [pageSearch, setPageSearch] = useState("");
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  const currentParent = breadcrumb.at(-1);
  const currentParentId = currentParent?.id ?? homepageId ?? undefined;
  const currentParentType = currentParent?.contentType ?? "page";

  const { data: spaces, isLoading: spacesLoading } = useConfluenceSpaces(true);
  const { data: children, isLoading: childrenLoading } = useConfluenceChildren(
    currentParentId,
    currentParentType,
  );

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

  const navigateInto = (id: string, title: string, contentType: string) => {
    setBreadcrumb((prev) => [...prev, { id, title, contentType }]);
    setPageSearch("");
    setSelectedPageId(null);
  };

  const navigateToBreadcrumb = (index: number) => {
    setBreadcrumb((prev) => prev.slice(0, index + 1));
    setPageSearch("");
    setSelectedPageId(null);
  };

  const handleLink = async () => {
    if (!selectedPageId || !spaceId) return;
    const child = filteredChildren.find((c) => c.id === selectedPageId);
    if (!child) return;
    setLinking(true);
    try {
      const page = await getConfluencePage(selectedPageId);
      const parentId = currentParentId ?? null;
      onLinked(page.id, spaceId, parentId, page.web_url, page.title);
    } catch {
      // Fallback: link without web_url — Related Work entry won't be created
      const parentId = currentParentId ?? null;
      onLinked(child.id, spaceId, parentId, null, child.title);
    } finally {
      setLinking(false);
    }
  };

  // ── Step 1: Space selection ─────────────────────────────────────────────────
  if (!spaceId) {
    return (
      <div className="flex h-full flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Link Existing Page
            </span>
          </div>
          {onCancel && (
            <button
              onClick={onCancel}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <p className="text-xs text-slate-400 dark:text-slate-500">
          Browse your Confluence spaces to find and link an existing feedback page.
        </p>

        {/* Search */}
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
          <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <input
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            type="text"
            placeholder="Search spaces…"
            value={spaceSearch}
            onChange={(e) => setSpaceSearch(e.target.value)}
            className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none dark:text-slate-200"
            autoFocus
          />
          {spaceSearch && (
            <button onClick={() => setSpaceSearch("")} className="text-slate-400 hover:text-slate-600">
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

  // ── Step 2: Page browser ────────────────────────────────────────────────────
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
                setSelectedPageId(null);
              } else {
                setSpaceId(null);
                setSpaceName("");
                setHomepageId(null);
                setBreadcrumb([]);
                setPageSearch("");
                setSelectedPageId(null);
              }
            }}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
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
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center gap-1 text-xs">
        <button
          onClick={() => navigateToBreadcrumb(-1)}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
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
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
        <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <input
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          type="text"
          placeholder="Search pages…"
          value={pageSearch}
          onChange={(e) => setPageSearch(e.target.value)}
          className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none dark:text-slate-200"
        />
        {pageSearch && (
          <button onClick={() => setPageSearch("")} className="text-slate-400 hover:text-slate-600">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Content list — pages can be selected OR navigated into (child pages) */}
      <div className="flex-1 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
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
          filteredChildren.map((c) => {
            const isFolder = c.contentType === "folder";
            const isSelected = c.id === selectedPageId;
            return (
              <div
                key={c.id}
                className={`flex w-full items-center border-b border-slate-100 last:border-b-0 dark:border-slate-800 ${
                  isSelected
                    ? "bg-blue-50 dark:bg-blue-900/20"
                    : "hover:bg-slate-50 dark:hover:bg-slate-800"
                }`}
              >
                {/* Main click area: select for pages, navigate for folders */}
                <button
                  onClick={() => {
                    if (isFolder) {
                      navigateInto(c.id, c.title, c.contentType);
                    } else {
                      setSelectedPageId(isSelected ? null : c.id);
                    }
                  }}
                  className="flex min-w-0 flex-1 items-center gap-3 px-4 py-2.5 text-left"
                >
                  {isFolder ? (
                    <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                  ) : isSelected ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                  ) : (
                    <BookOpen className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  )}
                  <span
                    className={`flex-1 truncate text-sm ${
                      isSelected
                        ? "font-medium text-blue-700 dark:text-blue-300"
                        : "text-slate-700 dark:text-slate-200"
                    }`}
                  >
                    {c.title}
                  </span>
                  {isFolder && (
                    <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:bg-amber-950 dark:text-amber-400">
                      Folder
                    </span>
                  )}
                </button>
                {/* Drill-down button: pages can have child pages too */}
                <button
                  onClick={() => navigateInto(c.id, c.title, c.contentType)}
                  title={`Browse inside "${c.title}"`}
                  className="shrink-0 rounded p-2 text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Action */}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button onClick={() => void handleLink()} disabled={!selectedPageId || linking}>
          {linking ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Link2 className="h-4 w-4" />
          )}
          {linking ? "Linking…" : "Link Selected Page"}
        </Button>
      </div>
    </div>
  );
}
