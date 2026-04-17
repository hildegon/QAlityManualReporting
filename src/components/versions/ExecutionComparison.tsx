import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  TrendingDown,
  TrendingUp,
  Shuffle,
  ChevronDown,
  Loader2,
  GitCompareArrows,
  Search,
  X,
} from "lucide-react";
import { PASS_STATUSES, FAIL_STATUSES } from "@/constants/statuses";
import { findSlice } from "@/components/charts/status-utils";
import { cn } from "@/components/ui/utils";
import { TestDetailModal } from "./TestDetailModal";
import {
  useProjectVersions,
  useTestExecutionsByVersion,
  useVersionRunStats,
} from "@/services/queries";
import type { TestRunHistory } from "@/services/queries";
import type { JiraVersion } from "@/types";

// ── Types ─────────────────────────────────────────────────────────────────────

type DiffCategory = "broken" | "fixed" | "changed" | "only-a" | "only-b";

interface ComparedTest {
  testIssueId: string;
  testKey: string;
  testSummary: string;
  testType: TestRunHistory["testType"];
  testTypeName?: string;
  category: DiffCategory;
  statusA: string | null;
  statusB: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getEffectiveStatus(test: TestRunHistory): string | null {
  const last = test.history[test.history.length - 1];
  return last?.statusName ?? null;
}

function categorize(statusA: string | null, statusB: string | null): DiffCategory | "same" {
  if (statusA === null) return "only-b";
  if (statusB === null) return "only-a";

  const normA = statusA.toUpperCase();
  const normB = statusB.toUpperCase();

  if (normA === normB) return "same";
  if (PASS_STATUSES.has(normA) && FAIL_STATUSES.has(normB)) return "fixed";
  if (FAIL_STATUSES.has(normA) && PASS_STATUSES.has(normB)) return "broken";
  return "changed";
}

/**
 * Score how similar candidateName is to refName.
 * Uses longest common prefix + shared token count.
 */
function similarityScore(refName: string, candidateName: string): number {
  const ref = refName.toLowerCase();
  const cand = candidateName.toLowerCase();

  let prefixLen = 0;
  while (prefixLen < ref.length && prefixLen < cand.length && ref[prefixLen] === cand[prefixLen]) {
    prefixLen++;
  }

  const tokenize = (s: string) => s.split(/[.\-_\s/]+/).filter(Boolean);
  const refTokens = new Set(tokenize(ref));
  const sharedTokens = tokenize(cand).filter((t) => refTokens.has(t)).length;

  return prefixLen * 2 + sharedTokens * 10;
}

function getSuggestedVersions(versionA: JiraVersion, candidates: JiraVersion[]): JiraVersion[] {
  return candidates
    .map((v) => ({ v, score: similarityScore(versionA.name, v.name) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ v }) => v);
}

function getCategoryLabel(cat: DiffCategory, versionAName: string, versionBName: string): string {
  if (cat === "only-a") return `Only in ${versionAName}`;
  if (cat === "only-b") return `Only in ${versionBName}`;
  if (cat === "broken") return "Broken";
  if (cat === "fixed") return "Fixed";
  return "Status changed";
}

// ── Category metadata ─────────────────────────────────────────────────────────

const CATEGORY_META: Record<
  DiffCategory,
  {
    icon: React.ComponentType<{ className?: string }>;
    headerClass: string;
    chipClass: string;
    order: number;
  }
> = {
  broken: {
    icon: TrendingDown,
    headerClass: "text-red-600 dark:text-red-400",
    chipClass:
      "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800",
    order: 0,
  },
  fixed: {
    icon: TrendingUp,
    headerClass: "text-emerald-600 dark:text-emerald-400",
    chipClass:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
    order: 1,
  },
  changed: {
    icon: Shuffle,
    headerClass: "text-amber-600 dark:text-amber-400",
    chipClass:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
    order: 2,
  },
  "only-a": {
    icon: ArrowRight,
    headerClass: "text-slate-500 dark:text-slate-400",
    chipClass:
      "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-700/50 dark:text-slate-300 dark:border-slate-600",
    order: 3,
  },
  "only-b": {
    icon: ArrowRight,
    headerClass: "text-slate-500 dark:text-slate-400",
    chipClass:
      "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-700/50 dark:text-slate-300 dark:border-slate-600",
    order: 4,
  },
};

// ── StatusBadge ───────────────────────────────────────────────────────────────

function StatusBadge({ statusName }: { statusName: string }) {
  const sl = findSlice(statusName);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        sl.lightBg,
        sl.borderClass,
        sl.textClass,
      )}
    >
      {statusName}
    </span>
  );
}

// ── ComparisonRow ─────────────────────────────────────────────────────────────

interface ComparisonRowProps {
  item: ComparedTest;
  projectKey: string;
  versionName: string;
  versionAName: string;
  versionBName: string;
}

function ComparisonRow({ item, projectKey, versionName, versionAName, versionBName }: ComparisonRowProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const meta = CATEGORY_META[item.category];
  const Icon = meta.icon;
  const label = getCategoryLabel(item.category, versionAName, versionBName);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setPreviewOpen(true)}
        onKeyDown={(e) => e.key === "Enter" && setPreviewOpen(true)}
        className="flex cursor-pointer flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600 dark:hover:bg-slate-700/50"
      >
        {/* Category chip */}
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold",
            meta.chipClass,
          )}
        >
          <Icon className="h-3 w-3" />
          {label}
        </span>

        {/* Test identity */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-200">
            {item.testSummary}
          </p>
          <p className="mt-0.5 font-mono text-xs text-slate-400">{item.testKey}</p>
        </div>

        {/* Status A → Status B */}
        <div className="flex shrink-0 items-center gap-1.5">
          {item.statusA !== null ? (
            <StatusBadge statusName={item.statusA} />
          ) : (
            <span className="text-xs text-slate-400">—</span>
          )}
          <ArrowRight className="h-3 w-3 text-slate-400" />
          {item.statusB !== null ? (
            <StatusBadge statusName={item.statusB} />
          ) : (
            <span className="text-xs text-slate-400">—</span>
          )}
        </div>
      </div>

      {previewOpen && (
        <TestDetailModal
          testKey={item.testKey}
          projectKey={projectKey}
          versionName={versionName}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </>
  );
}

// ── CategoryGroup ─────────────────────────────────────────────────────────────

interface CategoryGroupProps {
  category: DiffCategory;
  items: ComparedTest[];
  defaultOpen?: boolean;
  projectKey: string;
  versionAName: string;
  versionBName: string;
}

function CategoryGroup({
  category,
  items,
  defaultOpen = false,
  projectKey,
  versionAName,
  versionBName,
}: CategoryGroupProps) {
  const [open, setOpen] = useState(defaultOpen);
  const meta = CATEGORY_META[category];
  const Icon = meta.icon;
  const label = getCategoryLabel(category, versionAName, versionBName);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between bg-slate-50/70 px-3 py-2 text-left hover:bg-slate-100/70 dark:bg-slate-900/40 dark:hover:bg-slate-800/60"
      >
        <span className={cn("flex items-center gap-1.5 text-xs font-semibold", meta.headerClass)}>
          <Icon className="h-3.5 w-3.5" />
          {label}
          <span className="ml-1 rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
            {items.length}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-slate-400 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="space-y-1.5 p-2">
          {items.map((item) => (
            <ComparisonRow
              key={item.testIssueId}
              item={item}
              projectKey={projectKey}
              versionName={versionAName}
              versionAName={versionAName}
              versionBName={versionBName}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── VersionComparisonDiff ─────────────────────────────────────────────────────

interface VersionComparisonDiffProps {
  testsA: TestRunHistory[];
  versionA: JiraVersion;
  versionB: JiraVersion;
  projectKey: string;
}

function VersionComparisonDiff({
  testsA,
  versionA,
  versionB,
  projectKey,
}: VersionComparisonDiffProps) {
  const { data: execsB, isLoading: execsLoading } = useTestExecutionsByVersion(
    projectKey,
    versionB.name,
  );
  const statsB = useVersionRunStats(execsB ?? []);

  const isLoadingB =
    execsLoading ||
    (statsB.pagesExpected > 0 && statsB.pagesLoaded < statsB.pagesExpected) ||
    (execsB !== undefined && execsB.length > 0 && statsB.pagesExpected === 0);

  const grouped = useMemo<Partial<Record<DiffCategory, ComparedTest[]>>>(() => {
    if (statsB.allTests.length === 0 && testsA.length === 0) return {};

    // Build effective-status map for version A
    const mapA = new Map<
      string,
      {
        testKey: string;
        testSummary: string;
        testType: TestRunHistory["testType"];
        testTypeName?: string;
        statusA: string;
      }
    >();
    for (const t of testsA) {
      const statusA = getEffectiveStatus(t);
      if (!statusA) continue;
      mapA.set(t.testIssueId, {
        testKey: t.testKey,
        testSummary: t.testSummary,
        testType: t.testType,
        ...(t.testTypeName ? { testTypeName: t.testTypeName } : {}),
        statusA,
      });
    }

    const result: Partial<Record<DiffCategory, ComparedTest[]>> = {};

    const addEntry = (entry: ComparedTest) => {
      if (!result[entry.category]) result[entry.category] = [];
      result[entry.category]!.push(entry);
    };

    // Walk version B tests
    for (const t of statsB.allTests) {
      const statusB = getEffectiveStatus(t);
      if (!statusB) continue;

      const entryA = mapA.get(t.testIssueId);
      if (entryA) {
        const category = categorize(entryA.statusA, statusB);
        mapA.delete(t.testIssueId);
        if (category === "same") continue;
        addEntry({
          testIssueId: t.testIssueId,
          testKey: entryA.testKey,
          testSummary: entryA.testSummary,
          testType: entryA.testType,
          ...(entryA.testTypeName ? { testTypeName: entryA.testTypeName } : {}),
          category,
          statusA: entryA.statusA,
          statusB,
        });
      } else {
        // Only in B
        addEntry({
          testIssueId: t.testIssueId,
          testKey: t.testKey,
          testSummary: t.testSummary,
          testType: t.testType,
          ...(t.testTypeName ? { testTypeName: t.testTypeName } : {}),
          category: "only-b",
          statusA: null,
          statusB,
        });
      }
    }

    // Remaining A entries are only in A
    for (const [testIssueId, entryA] of mapA) {
      addEntry({
        testIssueId,
        testKey: entryA.testKey,
        testSummary: entryA.testSummary,
        testType: entryA.testType,
        ...(entryA.testTypeName ? { testTypeName: entryA.testTypeName } : {}),
        category: "only-a",
        statusA: entryA.statusA,
        statusB: null,
      });
    }

    return result;
  }, [testsA, statsB.allTests]);

  if (isLoadingB) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-slate-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading {versionB.name} test data…
      </div>
    );
  }

  const diffCategories: DiffCategory[] = ["broken", "fixed", "changed", "only-a", "only-b"];
  const totalChanged = diffCategories.reduce(
    (sum, cat) => sum + (grouped[cat]?.length ?? 0),
    0,
  );

  return (
    <div className="space-y-2">
      {/* Summary banner */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/40">
        <p className="text-xs text-slate-600 dark:text-slate-300">
          <span className="font-semibold text-slate-800 dark:text-slate-100">
            {versionB.name}
          </span>
          {" "}→{" "}
          <span className="font-semibold text-slate-800 dark:text-slate-100">
            {versionA.name}
          </span>
          {totalChanged > 0 ? (
            <>
              {" "}·{" "}
              <span className="font-semibold text-slate-800 dark:text-slate-100">
                {totalChanged}
              </span>{" "}
              {totalChanged === 1 ? "test" : "tests"} changed
              {(grouped["broken"]?.length ?? 0) > 0 && (
                <span className="ml-1.5 font-medium text-red-600 dark:text-red-400">
                  {grouped["broken"]!.length} broken
                </span>
              )}
              {(grouped["fixed"]?.length ?? 0) > 0 && (
                <span className="ml-1.5 font-medium text-emerald-600 dark:text-emerald-400">
                  {grouped["fixed"]!.length} fixed
                </span>
              )}
            </>
          ) : (
            <>
              {" "}·{" "}
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                No status changes
              </span>
            </>
          )}
        </p>
      </div>

      {/* Changed groups */}
      {diffCategories.map((cat) => {
        const items = grouped[cat];
        if (!items || items.length === 0) return null;
        return (
          <CategoryGroup
            key={cat}
            category={cat}
            items={items}
            defaultOpen={cat === "broken" || cat === "fixed"}
            projectKey={projectKey}
            versionAName={versionA.name}
            versionBName={versionB.name}
          />
        );
      })}
    </div>
  );
}

// ── VersionComparison (public export) ─────────────────────────────────────────

interface VersionComparisonProps {
  allTests: TestRunHistory[];
  versionA: JiraVersion;
  projectKey: string;
  isLoading: boolean;
}

/** Compares test results (effective status) between the current version and another version. */
export function VersionComparison({
  allTests,
  versionA,
  projectKey,
  isLoading,
}: VersionComparisonProps) {
  const { data: versions } = useProjectVersions(projectKey);
  const [selectedVersionId, setSelectedVersionId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const otherVersions = useMemo(
    () => (versions ?? []).filter((v) => v.id !== versionA.id && !v.archived),
    [versions, versionA.id],
  );

  const suggestedVersions = useMemo(
    () => getSuggestedVersions(versionA, otherVersions),
    [versionA, otherVersions],
  );

  const filteredVersions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return otherVersions;
    return otherVersions.filter((v) => v.name.toLowerCase().includes(q));
  }, [otherVersions, searchQuery]);

  const selectedVersion = useMemo(
    () => otherVersions.find((v) => v.id === selectedVersionId) ?? null,
    [otherVersions, selectedVersionId],
  );

  const calcPos = useCallback(() => {
    if (!inputRef.current) return;
    const r = inputRef.current.getBoundingClientRect();
    setDropPos({ top: r.bottom + 4, left: r.left, width: r.width });
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!dropdownOpen) return;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (inputRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      setDropdownOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [dropdownOpen]);

  const handleSelect = (id: string) => {
    setSelectedVersionId(id);
    setSearchQuery("");
    setDropdownOpen(false);
  };

  const showSuggestions = !searchQuery.trim() && suggestedVersions.length > 0;
  const displayValue = dropdownOpen ? searchQuery : (selectedVersion?.name ?? "");

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-2 text-xs text-slate-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading version data…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Version B picker */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
          Compare {versionA.name} against a previous version
        </label>

        <div className="relative">
          {/* Input */}
          <GitCompareArrows className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="Search or select a version to compare…"
            value={displayValue}
            onFocus={() => {
              calcPos();
              setSearchQuery("");
              setDropdownOpen(true);
            }}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (!dropdownOpen) {
                calcPos();
                setDropdownOpen(true);
              }
            }}
            className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-8 text-xs text-slate-800 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/20 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:focus:border-slate-500"
          />
          {/* Clear / search icon */}
          {selectedVersion && !dropdownOpen ? (
            <button
              onClick={() => {
                setSelectedVersionId("");
                setSearchQuery("");
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              aria-label="Clear selection"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : dropdownOpen ? (
            <Search className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
          ) : null}
        </div>
      </div>

      {/* Portaled dropdown — escapes overflow:hidden ancestors */}
      {dropdownOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: "fixed",
              top: dropPos.top,
              left: dropPos.left,
              width: dropPos.width,
              zIndex: 9999,
            }}
            className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-600 dark:bg-slate-700"
          >
            <div className="max-h-64 overflow-y-auto">
              {/* Suggested section — shown when not searching */}
              {showSuggestions && (
                <>
                  <p className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Suggested
                  </p>
                  {suggestedVersions.map((v) => (
                    <button
                      key={v.id}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSelect(v.id);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-600",
                        selectedVersionId === v.id && "bg-slate-100 dark:bg-slate-600",
                      )}
                    >
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {v.name}
                      </span>
                      {v.released && (
                        <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                          Released
                        </span>
                      )}
                    </button>
                  ))}
                  {filteredVersions.length > 0 && (
                    <div className="my-1 border-t border-slate-100 dark:border-slate-600" />
                  )}
                  <p className="px-2.5 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    All versions
                  </p>
                </>
              )}

              {/* Filtered version list */}
              {filteredVersions.map((v) => (
                <button
                  key={v.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(v.id);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-600",
                    selectedVersionId === v.id && "bg-slate-100 dark:bg-slate-600",
                  )}
                >
                  <span className="font-medium text-slate-800 dark:text-slate-200">{v.name}</span>
                  {v.released && (
                    <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                      Released
                    </span>
                  )}
                </button>
              ))}

              {filteredVersions.length === 0 && (
                <p className="px-2.5 py-3 text-xs text-slate-400">
                  No versions match &ldquo;{searchQuery}&rdquo;
                </p>
              )}
            </div>
          </div>,
          document.body,
        )}

      {selectedVersion ? (
        <VersionComparisonDiff
          key={selectedVersion.id}
          testsA={allTests}
          versionA={versionA}
          versionB={selectedVersion}
          projectKey={projectKey}
        />
      ) : (
        <p className="text-xs text-slate-400">
          Pick a version above to see which tests changed between the two versions.
        </p>
      )}
    </div>
  );
}

// ── Legacy export alias (preserves old import in VersionDashboard) ────────────

/** @deprecated Use VersionComparison instead */
export { VersionComparison as ExecutionComparison };
