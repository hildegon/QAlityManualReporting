import { useState, useMemo, useRef, useEffect } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useGetTestSets, queryKeys } from "@/services/queries";
import { useContentProjectKey } from "@/hooks/useProjectKey";
import { parseRateLimitError } from "@/stores/uiStore";
import { useCoveragePresetsStore } from "@/stores/coveragePresetsStore";
import type { CoveragePreset } from "@/stores/coveragePresetsStore";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Activity,
  AlertTriangle,
  BookmarkCheck,
  BookmarkPlus,
  CheckSquare2,
  ChevronDown,
  ChevronRight,
  Clock,
  Layers,
  Pencil,
  RefreshCw,
  Search,
  Square,
  Trash2,
} from "lucide-react";
import { cn } from "@/components/ui/utils";
import { EmptyState } from "@/components/common/EmptyState";
import type { XrayTestSet, XrayTestWithStatus } from "@/types";
import * as api from "@/services/tauri";
import {
  DonutChart,
  StatCard,
  StackedBar,
  MiniStackedBar,
  buildSlicesFromTests,
  findSlice,
} from "@/components/charts/StatusCharts";

// ── Overall dashboard card ────────────────────────────────────────────────────

function OverallDashboard({
  allTests,
  selectedCount,
}: {
  allTests: XrayTestWithStatus[];
  selectedCount: number;
}) {
  const slices = useMemo(() => buildSlicesFromTests(allTests), [allTests]);
  const total = allTests.length;
  const passedSlice = slices.find((s) => s.key === "PASS");
  const failedSlice = slices.find((s) => s.key === "FAIL");
  const passRate = total > 0 && passedSlice ? passedSlice.pct : null;

  const healthLabel =
    total === 0
      ? "No data"
      : passRate === 1
        ? "All passing"
        : passRate !== null
          ? `${Math.round(passRate * 100)}% passing`
          : "—";

  const healthColor =
    total === 0
      ? "text-slate-400 bg-slate-50 border-slate-200"
      : passRate === 1
        ? "text-emerald-600 bg-emerald-50 border-emerald-200"
        : passRate !== null && passRate >= 0.8
          ? "text-blue-600 bg-blue-50 border-blue-200"
          : failedSlice && failedSlice.count > 0
            ? "text-red-600 bg-red-50 border-red-200"
            : "text-slate-500 bg-slate-50 border-slate-200";

  if (total === 0) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Overall coverage
          </p>
          <h2 className="mt-0.5 text-lg font-bold text-slate-900">
            {selectedCount} set{selectedCount !== 1 ? "s" : ""} selected
          </h2>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full border px-3 py-1 text-xs font-semibold",
            healthColor,
          )}
        >
          {healthLabel}
        </span>
      </div>

      <div className="space-y-5">
        {total > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-5">
              <DonutChart slices={slices} total={total} label="tests" />
              <div
                className="grid flex-1 gap-2"
                style={{
                  gridTemplateColumns: `repeat(${Math.min(slices.length, 3)}, minmax(0, 1fr))`,
                  minWidth: 220,
                }}
              >
                {slices.map((sl) => (
                  <StatCard key={sl.key} sl={sl} />
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-slate-400">Status distribution</p>
              <StackedBar slices={slices} />
            </div>
          </>
        )}

        <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-400">
          <span>
            Test sets: <span className="font-medium text-slate-600">{selectedCount}</span>
          </span>
          <span>
            Total tests: <span className="font-medium text-slate-600">{total}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Single test set section ───────────────────────────────────────────────────

interface TestSetSectionProps {
  testSet: XrayTestSet;
  tests: XrayTestWithStatus[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  testSearch: string;
}

function TestSetSection({
  testSet,
  tests,
  isLoading,
  isError,
  error,
  onRetry,
  testSearch,
}: TestSetSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const rateLimitUntil = isError ? parseRateLimitError(error) : null;
  const errorMessage = isError ? (error instanceof Error ? error.message : String(error)) : null;

  const slices = useMemo(() => buildSlicesFromTests(tests ?? []), [tests]);

  const filtered = useMemo(() => {
    if (!tests) return [];
    const q = testSearch.trim().toLowerCase();
    if (!q) return tests;
    return tests.filter(
      (t) => t.jira.key.toLowerCase().includes(q) || t.jira.summary.toLowerCase().includes(q),
    );
  }, [tests, testSearch]);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Section header */}
      <button
        className="flex w-full items-center gap-3 bg-slate-50 px-4 py-3 text-left hover:bg-slate-100"
        onClick={() => setCollapsed((c) => !c)}
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
        )}
        <Layers className="h-4 w-4 shrink-0 text-slate-400" />
        <span className="w-28 shrink-0 font-mono text-xs text-slate-500">{testSet.jira.key}</span>
        <span className="flex-1 truncate text-sm font-semibold text-slate-700">
          {testSet.jira.summary}
        </span>
        {isLoading && <Spinner size="sm" />}
        {!isLoading && !isError && tests && slices.length > 0 && <MiniStackedBar slices={slices} />}
        {!isLoading && !isError && tests && (
          <span className="shrink-0 text-xs text-slate-400">
            {tests.length} test{tests.length !== 1 ? "s" : ""}
          </span>
        )}
      </button>

      {/* Dashboard + test rows */}
      {!collapsed && (
        <div>
          {/* Per-set dashboard strip */}
          {!isLoading && !isError && tests && tests.length > 0 && (
            <div className="border-b border-slate-100 px-5 py-4">
              <div className="flex flex-wrap items-center gap-5">
                <DonutChart slices={slices} total={tests.length} label="tests" />
                <div className="flex-1 space-y-3" style={{ minWidth: 200 }}>
                  <div
                    className="grid gap-2"
                    style={{
                      gridTemplateColumns: `repeat(${Math.min(slices.length, 3)}, minmax(0, 1fr))`,
                    }}
                  >
                    {slices.map((sl) => (
                      <StatCard key={sl.key} sl={sl} />
                    ))}
                  </div>
                  <StackedBar slices={slices} />
                </div>
              </div>
            </div>
          )}

          <div className="divide-y divide-slate-100">
            {isLoading && (
              <div className="flex items-center gap-2 px-4 py-3 text-sm text-slate-400">
                <Spinner size="sm" />
                Loading tests…
              </div>
            )}
            {isError && (
              <div className="flex items-start gap-2 px-4 py-3 text-sm text-red-600">
                {rateLimitUntil !== null ? (
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <div className="flex-1">
                  {rateLimitUntil !== null ? (
                    <span className="text-amber-700">
                      Rate limited — please wait before retrying.
                    </span>
                  ) : (
                    <span>{errorMessage ?? "Failed to load tests for this set."}</span>
                  )}
                </div>
                <button
                  className="shrink-0 rounded px-2 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50"
                  onClick={onRetry}
                >
                  Retry
                </button>
              </div>
            )}
            {!isLoading && !isError && filtered.length === 0 && (
              <p className="px-4 py-3 text-sm italic text-slate-400">
                {testSearch.trim() ? "No tests match the filter." : "This test set has no tests."}
              </p>
            )}
            {!isLoading &&
              !isError &&
              filtered.map((test) => (
                <div
                  key={test.issue_id}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50"
                >
                  <span className="w-28 shrink-0 font-mono text-xs text-slate-400">
                    {test.jira.key}
                  </span>
                  <span className="flex-1 truncate text-sm text-slate-700">
                    {test.jira.summary}
                  </span>
                  <StatusBadge
                    name={test.latest_status?.name ?? "NOT RUN"}
                    {...(test.latest_status?.color !== undefined
                      ? { color: test.latest_status.color }
                      : {})}
                  />
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

interface StatusBadgeProps {
  name: string;
  color?: string;
}

function StatusBadge({ name, color }: StatusBadgeProps) {
  const sl = findSlice(name);
  if (color && color.startsWith("#")) {
    return (
      <span
        className="inline-block rounded px-2 py-0.5 text-xs font-semibold"
        style={{ backgroundColor: color + "26", color }}
      >
        {name}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-block rounded px-2 py-0.5 text-xs font-semibold",
        sl.lightBg,
        sl.textClass,
      )}
    >
      {name}
    </span>
  );
}

// ── Presets bar ───────────────────────────────────────────────────────────────

interface PresetsBarProps {
  selectedSetIds: Set<string>;
  onLoad: (preset: CoveragePreset) => void;
  activePresetId: string | null;
  isModified: boolean;
  onSave: (name: string) => void;
  onUpdate: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}

function PresetsBar({
  selectedSetIds,
  onLoad,
  activePresetId,
  isModified,
  onSave,
  onUpdate,
  onDelete,
  onRename,
}: PresetsBarProps) {
  const presets = useCoveragePresetsStore((s) => s.presets);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Focus the save-name input when it appears.
  useEffect(() => {
    if (saving) nameInputRef.current?.focus();
  }, [saving]);

  // Focus the rename input when it appears.
  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus();
  }, [renamingId]);

  const handleSaveConfirm = () => {
    const name = newName.trim();
    if (!name) return;
    onSave(name);
    setNewName("");
    setSaving(false);
  };

  const handleRenameConfirm = (id: string) => {
    const name = renameValue.trim();
    if (name) onRename(id, name);
    setRenamingId(null);
    setRenameValue("");
  };

  const startRename = (preset: CoveragePreset) => {
    setRenamingId(preset.id);
    setRenameValue(preset.name);
    setSaving(false);
  };

  const canSave = selectedSetIds.size > 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Presets</p>

        {/* Save / Update buttons */}
        <div className="flex items-center gap-1.5">
          {activePresetId && isModified && (
            <button
              onClick={onUpdate}
              className="flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-amber-600 hover:bg-amber-50"
              title="Update current preset with the current selection"
            >
              <BookmarkCheck className="h-3.5 w-3.5" />
              Update
            </button>
          )}
          {canSave && !saving && (
            <button
              onClick={() => {
                setSaving(true);
                setRenamingId(null);
              }}
              className="flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              title="Save current selection as a new preset"
            >
              <BookmarkPlus className="h-3.5 w-3.5" />
              Save
            </button>
          )}
        </div>
      </div>

      {/* Inline name input for new preset */}
      {saving && (
        <div className="flex items-center gap-1.5">
          <Input
            ref={nameInputRef}
            className="h-7 flex-1 text-xs"
            placeholder="Preset name…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveConfirm();
              if (e.key === "Escape") {
                setSaving(false);
                setNewName("");
              }
            }}
          />
          <button
            onClick={handleSaveConfirm}
            disabled={!newName.trim()}
            className="rounded px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
          >
            Save
          </button>
          <button
            onClick={() => {
              setSaving(false);
              setNewName("");
            }}
            className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-100"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Preset chips */}
      {presets.length === 0 && !saving && (
        <p className="text-xs italic text-slate-400">
          {canSave ? 'Click "Save" to create your first preset.' : "No presets yet."}
        </p>
      )}

      {presets.length > 0 && (
        <div className="space-y-1">
          {presets.map((preset) => {
            const isActive = preset.id === activePresetId;

            if (renamingId === preset.id) {
              return (
                <div key={preset.id} className="flex items-center gap-1.5">
                  <Input
                    ref={renameInputRef}
                    className="h-7 flex-1 text-xs"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRenameConfirm(preset.id);
                      if (e.key === "Escape") {
                        setRenamingId(null);
                        setRenameValue("");
                      }
                    }}
                  />
                  <button
                    onClick={() => handleRenameConfirm(preset.id)}
                    disabled={!renameValue.trim()}
                    className="rounded px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
                  >
                    OK
                  </button>
                  <button
                    onClick={() => {
                      setRenamingId(null);
                      setRenameValue("");
                    }}
                    className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-100"
                  >
                    ✕
                  </button>
                </div>
              );
            }

            return (
              <div key={preset.id} className="group flex items-center gap-1">
                <button
                  onClick={() => onLoad(preset)}
                  className={cn(
                    "flex flex-1 items-center gap-1.5 truncate rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors",
                    isActive && !isModified
                      ? "border-slate-700 bg-slate-700 font-semibold text-white"
                      : isActive && isModified
                        ? "border-amber-400 bg-amber-50 font-semibold text-amber-800"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
                  )}
                  title={`${preset.setIds.length} set${preset.setIds.length !== 1 ? "s" : ""}`}
                >
                  <span className="truncate">{preset.name}</span>
                  <span
                    className={cn(
                      "ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                      isActive && !isModified
                        ? "bg-white/20 text-white"
                        : isActive && isModified
                          ? "bg-amber-200 text-amber-700"
                          : "bg-slate-100 text-slate-400",
                    )}
                  >
                    {preset.setIds.length}
                  </span>
                  {isActive && isModified && (
                    <span className="shrink-0 text-[10px] font-normal text-amber-600">
                      modified
                    </span>
                  )}
                </button>

                {/* Action icons (shown on hover) */}
                <button
                  onClick={() => startRename(preset)}
                  className="shrink-0 rounded p-1 text-slate-300 opacity-0 transition-opacity hover:bg-slate-100 hover:text-slate-500 group-hover:opacity-100"
                  title="Rename preset"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  onClick={() => onDelete(preset.id)}
                  className="shrink-0 rounded p-1 text-slate-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                  title="Delete preset"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function CoveragePage() {
  const projectKey = useContentProjectKey();
  const queryClient = useQueryClient();
  const { savePreset, updatePreset, deletePreset, renamePreset } = useCoveragePresetsStore();
  const {
    data: testSets,
    isLoading: setsLoading,
    isError: setsError,
    refetch: refetchSets,
    isFetching: setsFetching,
  } = useGetTestSets(projectKey ?? undefined);

  const [setSearch, setSetSearch] = useState("");
  const [testSearch, setTestSearch] = useState("");
  const [selectedSetIds, setSelectedSetIds] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [loadedPresetSetIds, setLoadedPresetSetIds] = useState<string[]>([]);

  // Dirty detection: preset is "modified" when selection drifts from what was loaded.
  const isModified = useMemo(() => {
    if (!activePresetId) return false;
    const current = [...selectedSetIds].sort().join(",");
    const original = [...loadedPresetSetIds].sort().join(",");
    return current !== original;
  }, [activePresetId, selectedSetIds, loadedPresetSetIds]);

  // Filtered list of test sets for the selector panel.
  const filteredSets = useMemo(() => {
    const q = setSearch.trim().toLowerCase();
    return (testSets ?? []).filter(
      (ts) =>
        !q || ts.jira.key.toLowerCase().includes(q) || ts.jira.summary.toLowerCase().includes(q),
    );
  }, [testSets, setSearch]);

  // The ordered list of selected test set objects (preserving display order).
  const selectedSets = useMemo(
    () => (testSets ?? []).filter((ts) => selectedSetIds.has(ts.issue_id)),
    [testSets, selectedSetIds],
  );

  // Fetch tests-with-status for every selected set in parallel.
  const testQueries = useQueries({
    queries: selectedSets.map((ts) => ({
      queryKey: queryKeys.testSetTestsWithStatus(ts.issue_id),
      queryFn: () => api.getTestSetTestsWithStatus(ts.issue_id),
      enabled: true,
      staleTime: 2 * 60 * 1_000,
    })),
  });

  const queryBySetId = useMemo(() => {
    const map = new Map<
      string,
      {
        tests: XrayTestWithStatus[] | undefined;
        isLoading: boolean;
        isError: boolean;
        error: unknown;
      }
    >();
    selectedSets.forEach((ts, i) => {
      const q = testQueries[i];
      map.set(ts.issue_id, {
        tests: q?.data,
        isLoading: q?.isLoading ?? false,
        isError: q?.isError ?? false,
        error: q?.error,
      });
    });
    return map;
  }, [selectedSets, testQueries]);

  // Grand total across all loaded sets.
  const allTests = useMemo(
    () => [...queryBySetId.values()].flatMap((q) => q.tests ?? []),
    [queryBySetId],
  );

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetchSets();
    setIsRefreshing(false);
  };

  const toggleSet = (id: string) => {
    setSelectedSetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedSetIds(new Set(filteredSets.map((ts) => ts.issue_id)));
  const clearAll = () => setSelectedSetIds(new Set());

  // ── Preset handlers ──────────────────────────────────────────────────────────

  const handleLoadPreset = (preset: CoveragePreset) => {
    setSelectedSetIds(new Set(preset.setIds));
    setActivePresetId(preset.id);
    setLoadedPresetSetIds(preset.setIds);
  };

  const handleSavePreset = (name: string) => {
    const ids = [...selectedSetIds];
    const preset = savePreset(name, ids);
    setActivePresetId(preset.id);
    setLoadedPresetSetIds(ids);
  };

  const handleUpdatePreset = () => {
    if (!activePresetId) return;
    const ids = [...selectedSetIds];
    const existing = useCoveragePresetsStore
      .getState()
      .presets.find((p) => p.id === activePresetId);
    if (!existing) return;
    updatePreset(activePresetId, existing.name, ids);
    setLoadedPresetSetIds(ids);
  };

  const handleDeletePreset = (id: string) => {
    deletePreset(id);
    if (activePresetId === id) {
      setActivePresetId(null);
      setLoadedPresetSetIds([]);
    }
  };

  if (!projectKey) {
    return (
      <EmptyState icon={Activity} message="Set a Project Key in Settings to view test coverage." />
    );
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-6">
      {/* ── Left panel: presets + set selector ── */}
      <div className="flex w-72 shrink-0 flex-col gap-4">
        {/* Presets */}
        <PresetsBar
          selectedSetIds={selectedSetIds}
          onLoad={handleLoadPreset}
          activePresetId={activePresetId}
          isModified={isModified}
          onSave={handleSavePreset}
          onUpdate={handleUpdatePreset}
          onDelete={handleDeletePreset}
          onRename={(id, name) => renamePreset(id, name)}
        />

        {/* Divider */}
        <div className="h-px bg-slate-200" />

        {/* Test sets */}
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Test Sets
            </p>
            <button
              onClick={() => void handleRefresh()}
              disabled={setsFetching || isRefreshing}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
              title="Reload test sets"
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5", (setsFetching || isRefreshing) && "animate-spin")}
              />
            </button>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-8 text-xs"
              placeholder="Filter sets…"
              value={setSearch}
              onChange={(e) => setSetSearch(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              {selectedSetIds.size > 0 && (
                <span className="mr-1.5 rounded-full bg-slate-700 px-1.5 py-0.5 text-white">
                  {selectedSetIds.size} selected
                </span>
              )}
              {filteredSets.length} set{filteredSets.length !== 1 ? "s" : ""}
            </span>
            <div className="flex gap-2">
              <button className="hover:text-slate-700" onClick={selectAll}>
                All
              </button>
              {selectedSetIds.size > 0 && (
                <button className="hover:text-slate-700" onClick={clearAll}>
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {setsLoading && (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full rounded-lg" />
                ))}
              </div>
            )}
            {setsError && (
              <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                Failed to load test sets.{" "}
                <button className="underline" onClick={() => void refetchSets()}>
                  Retry
                </button>
              </div>
            )}
            {!setsLoading && !setsError && filteredSets.length === 0 && (
              <p className="py-4 text-center text-xs italic text-slate-400">
                {setSearch.trim()
                  ? "No test sets match the filter."
                  : `No test sets found in ${projectKey}.`}
              </p>
            )}
            <div className="space-y-1">
              {filteredSets.map((ts) => {
                const selected = selectedSetIds.has(ts.issue_id);
                return (
                  <button
                    key={ts.issue_id}
                    onClick={() => toggleSet(ts.issue_id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors",
                      selected
                        ? "border-slate-700 bg-slate-700 text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
                    )}
                  >
                    <span className="mt-0.5 shrink-0">
                      {selected ? (
                        <CheckSquare2 className="h-4 w-4 text-white" />
                      ) : (
                        <Square className="h-4 w-4 text-slate-300" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">{ts.jira.summary}</p>
                      <p
                        className={cn(
                          "font-mono text-[10px]",
                          selected ? "text-slate-300" : "text-slate-400",
                        )}
                      >
                        {ts.jira.key}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="w-px shrink-0 bg-slate-200" />

      {/* ── Right panel: coverage dashboard ── */}
      <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-hidden">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-slate-400" />
            <h1 className="text-xl font-semibold">
              Coverage
              <span className="ml-2 text-sm font-normal text-slate-500">{projectKey}</span>
            </h1>
          </div>
          <div className="relative w-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-8 text-xs"
              placeholder="Filter tests…"
              value={testSearch}
              onChange={(e) => setTestSearch(e.target.value)}
            />
          </div>
        </div>

        {selectedSets.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-slate-400">
            <Layers className="h-12 w-12 opacity-30" />
            <p className="text-sm">Select test sets on the left to view coverage.</p>
          </div>
        )}

        {selectedSets.length > 0 && (
          <div className="flex-1 space-y-4 overflow-y-auto pb-4">
            <OverallDashboard allTests={allTests} selectedCount={selectedSets.length} />
            {selectedSets.map((ts) => {
              const q = queryBySetId.get(ts.issue_id);
              return (
                <TestSetSection
                  key={ts.issue_id}
                  testSet={ts}
                  tests={q?.tests}
                  isLoading={q?.isLoading ?? false}
                  isError={q?.isError ?? false}
                  error={q?.error}
                  onRetry={() =>
                    void queryClient.refetchQueries({
                      queryKey: queryKeys.testSetTestsWithStatus(ts.issue_id),
                    })
                  }
                  testSearch={testSearch}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
