import { useState } from "react";
import {
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Search,
  X,
  Tag,
  Zap,
  ChevronsDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import * as api from "@/services/tauri";
import type { XrayTestSet } from "@/types";
import { TestSetSelect } from "./TestSetSelect";
import { ComponentRow } from "./ComponentRow";
import { CopyKeyButton } from "./CopyKeyButton";

// ── Local types ───────────────────────────────────────────────────────────────

interface BulkRow {
  _id: string;
  summary: string;
  testSetId: string;
}

interface BulkCreatedResult {
  rowId: string;
  summary: string;
  key: string | null;
  issueId: string | null;
  error: string | null;
}

interface JiraComponent {
  id: string;
  name: string;
}

let _bulkId = 0;
const newBulkRow = (): BulkRow => ({ _id: String(++_bulkId), summary: "", testSetId: "" });

// ── Component ─────────────────────────────────────────────────────────────────

interface BulkTestCreationPanelProps {
  projectKey: string;
  testSets: XrayTestSet[] | undefined;
  testSetsLoading: boolean;
  components: JiraComponent[] | undefined;
  componentsLoading: boolean;
  jiraConfigured: boolean;
}

export function BulkTestCreationPanel({
  projectKey,
  testSets,
  testSetsLoading,
  components,
  componentsLoading,
  jiraConfigured,
}: BulkTestCreationPanelProps) {
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([newBulkRow(), newBulkRow(), newBulkRow()]);
  const [bulkComponent, setBulkComponent] = useState("");
  const [bulkComponentSearch, setBulkComponentSearch] = useState("");
  const [isBulkCreating, setIsBulkCreating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });
  const [bulkResults, setBulkResults] = useState<BulkCreatedResult[]>([]);

  const canBulkCreate = !isBulkCreating && bulkRows.some((r) => r.summary.trim());

  // ── Helpers ────────────────────────────────────────────────────────────────

  const filteredBulkComponents = (components ?? []).filter((c) => {
    const q = bulkComponentSearch.toLowerCase();
    return !q || c.name.toLowerCase().includes(q);
  });

  const addBulkRow = () => setBulkRows((prev) => [...prev, newBulkRow()]);

  const applyTestSetToAll = (testSetId: string) =>
    setBulkRows((prev) => prev.map((r) => ({ ...r, testSetId })));

  const removeBulkRow = (id: string) =>
    setBulkRows((prev) => (prev.length > 1 ? prev.filter((r) => r._id !== id) : prev));

  const updateBulkRow = (
    id: string,
    field: keyof Pick<BulkRow, "summary" | "testSetId">,
    value: string,
  ) => setBulkRows((prev) => prev.map((r) => (r._id === id ? { ...r, [field]: value } : r)));

  const handleBulkCreate = async () => {
    const validRows = bulkRows.filter((r) => r.summary.trim());
    if (validRows.length === 0) return;

    setIsBulkCreating(true);
    setBulkResults([]);
    setBulkProgress({ done: 0, total: validRows.length });

    const results: BulkCreatedResult[] = [];
    const trimmedComponent = bulkComponent.trim() || undefined;

    try {
      for (const row of validRows) {
        try {
          const result = await api.createTest(
            projectKey,
            row.summary.trim(),
            [],
            trimmedComponent,
          );
          const key = result.test?.jira.key ?? null;
          const issueId = result.test?.issue_id ?? null;
          if (issueId && row.testSetId) {
            try {
              await api.addTestsToTestSet(row.testSetId, [issueId]);
            } catch {
              // non-fatal: test was created, linking just failed
            }
          }
          results.push({ rowId: row._id, summary: row.summary, key, issueId, error: null });
        } catch (err) {
          results.push({
            rowId: row._id,
            summary: row.summary,
            key: null,
            issueId: null,
            error: String(err),
          });
        }
        setBulkProgress((p) => ({ ...p, done: p.done + 1 }));
        setBulkResults([...results]);
      }
    } finally {
      setIsBulkCreating(false);
    }
  };

  const resetBulk = () => {
    setBulkRows([newBulkRow(), newBulkRow(), newBulkRow()]);
    setBulkComponent("");
    setBulkComponentSearch("");
    setBulkResults([]);
    setBulkProgress({ done: 0, total: 0 });
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Component selector */}
      <div className="space-y-1.5">
        <Label>
          Component{" "}
          <span className="font-normal text-slate-400">(optional — applied to all tests)</span>
        </Label>

        {jiraConfigured ? (
          <div className="space-y-2">
            {bulkComponent && (
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-100 py-0.5 pl-2.5 pr-1.5 text-xs font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200">
                <Tag className="h-3 w-3 text-slate-400" />
                {bulkComponent}
                <button
                  type="button"
                  onClick={() => {
                    setBulkComponent("");
                    setBulkComponentSearch("");
                  }}
                  disabled={isBulkCreating}
                  className="ml-0.5 rounded-full text-slate-400 hover:text-slate-600 disabled:opacity-50"
                  aria-label="Clear component"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}

            <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 dark:border-slate-700">
                <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter components…"
                  value={bulkComponentSearch}
                  onChange={(e) => setBulkComponentSearch(e.target.value)}
                  disabled={isBulkCreating}
                  className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed dark:text-slate-200 dark:placeholder:text-slate-500"
                />
                {bulkComponentSearch && (
                  <button
                    type="button"
                    onClick={() => setBulkComponentSearch("")}
                    className="text-slate-400 hover:text-slate-600"
                    aria-label="Clear filter"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="max-h-40 overflow-y-auto">
                {componentsLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <Spinner className="h-4 w-4 text-slate-400" />
                  </div>
                ) : filteredBulkComponents.length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-400">
                    {(components ?? []).length === 0
                      ? "No components found in this project."
                      : "No components match your filter."}
                  </p>
                ) : (
                  filteredBulkComponents.map((c) => (
                    <ComponentRow
                      key={c.id}
                      name={c.name}
                      selected={bulkComponent === c.name}
                      disabled={isBulkCreating}
                      onSelect={() =>
                        setBulkComponent((prev) => (prev === c.name ? "" : c.name))
                      }
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          <Input
            placeholder="e.g. Authentication"
            value={bulkComponent}
            onChange={(e) => setBulkComponent(e.target.value)}
            disabled={isBulkCreating}
          />
        )}
      </div>

      {/* Test rows */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Tests ({bulkRows.filter((r) => r.summary.trim()).length} /{" "}
            {bulkRows.length})
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addBulkRow}
            disabled={isBulkCreating}
          >
            <Plus className="h-3.5 w-3.5" />
            Add row
          </Button>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[1fr_280px_32px_32px] gap-2 px-1">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Test name *
          </span>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Test Set
          </span>
          <span />
          <span />
        </div>

        <div className="space-y-1.5">
          {bulkRows.map((row) => (
            <div key={row._id} className="grid grid-cols-[1fr_280px_32px_32px] items-center gap-2">
              <Input
                placeholder="Test name"
                value={row.summary}
                onChange={(e) => updateBulkRow(row._id, "summary", e.target.value)}
                disabled={isBulkCreating}
                className="h-8 text-sm"
              />
              <TestSetSelect
                value={row.testSetId}
                testSets={testSets ?? []}
                isLoading={testSetsLoading}
                disabled={isBulkCreating}
                onChange={(id) => updateBulkRow(row._id, "testSetId", id)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => applyTestSetToAll(row.testSetId)}
                disabled={!row.testSetId || isBulkCreating || bulkRows.length === 1}
                aria-label="Apply this test set to all rows"
                title="Apply to all rows"
                className="h-8 w-8 text-slate-400 hover:text-slate-700 disabled:opacity-20 dark:hover:text-slate-200"
              >
                <ChevronsDown className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeBulkRow(row._id)}
                disabled={bulkRows.length === 1 || isBulkCreating}
                aria-label="Remove row"
                className="h-8 w-8 text-slate-400 hover:text-red-500"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>

        <p className="text-xs text-slate-400 dark:text-slate-500">
          Rows with an empty name will be skipped.
        </p>
      </div>

      {/* Progress */}
      {isBulkCreating && (
        <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
          <Spinner className="h-4 w-4 shrink-0" />
          <span>
            Creating tests… {bulkProgress.done} / {bulkProgress.total}
          </span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
        <Button onClick={() => void handleBulkCreate()} disabled={!canBulkCreate}>
          {isBulkCreating ? (
            <>
              <Spinner className="h-4 w-4" />
              Creating…
            </>
          ) : (
            <>
              <Zap className="h-4 w-4" />
              Create All
            </>
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isBulkCreating}
          onClick={resetBulk}
        >
          Reset
        </Button>
      </div>

      {/* Results */}
      {bulkResults.length > 0 && (
        <div className="space-y-3">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Results — {bulkResults.filter((r) => r.key).length} created
            {bulkResults.some((r) => r.error) &&
              `, ${bulkResults.filter((r) => r.error).length} failed`}
          </span>

          <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-700">
                  <th className="w-8 px-2 py-2" />
                  <th className="w-32 px-3 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">
                    Key
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">
                    Name
                  </th>
                  <th className="w-20 px-3 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {bulkResults.map((r) => (
                  <tr
                    key={r.rowId}
                    className="border-b border-slate-50 last:border-0 dark:border-slate-700"
                  >
                    <td className="px-2 py-2">
                      {r.key && <CopyKeyButton keyValue={r.key} />}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs font-medium text-slate-700 dark:text-slate-300">
                      {r.key ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
                      {r.summary}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.error ? (
                        <span
                          className="flex items-center gap-1 text-red-600 dark:text-red-400"
                          title={r.error}
                        >
                          <AlertCircle className="h-3 w-3 shrink-0" />
                          Failed
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-3 w-3 shrink-0" />
                          Created
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
