import { useState, useRef, useEffect } from "react";
import { Search, X, ChevronDown } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/components/ui/utils";
import type { XrayTestSet } from "@/types";

export interface TestSetSelectProps {
  value: string;
  testSets: XrayTestSet[];
  isLoading: boolean;
  disabled: boolean;
  onChange: (testSetId: string) => void;
}

export function TestSetSelect({ value, testSets, isLoading, disabled, onChange }: TestSetSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 0);
  }, [open]);

  const selected = testSets.find((ts) => ts.issue_id === value);
  const filtered = testSets.filter((ts) => {
    const q = search.toLowerCase();
    return (
      !q ||
      ts.jira.key.toLowerCase().includes(q) ||
      ts.jira.summary.toLowerCase().includes(q)
    );
  });

  const select = (id: string) => {
    onChange(id);
    setOpen(false);
    setSearch("");
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        disabled={disabled || isLoading}
        className={cn(
          "flex h-8 w-full items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 text-left shadow-sm transition-colors",
          "hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "dark:border-slate-600 dark:bg-slate-800",
          open && "border-slate-400 ring-2 ring-slate-400",
        )}
      >
        {isLoading ? (
          <Spinner className="h-3 w-3 shrink-0 text-slate-400" />
        ) : selected ? (
          <>
            <span className="shrink-0 font-mono text-xs font-medium text-slate-500 dark:text-slate-400">
              {selected.jira.key}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-slate-700 dark:text-slate-200">
              {selected.jira.summary}
            </span>
          </>
        ) : (
          <span className="flex-1 text-xs text-slate-400 dark:text-slate-500">
            — No test set —
          </span>
        )}
        <ChevronDown
          className={cn(
            "ml-auto h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
          {/* Search */}
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 dark:border-slate-700">
            <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Filter test sets…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none dark:text-slate-200 dark:placeholder:text-slate-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="text-slate-400 hover:text-slate-600"
                aria-label="Clear filter"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Options */}
          <div className="max-h-52 overflow-y-auto">
            {/* Clear option */}
            <button
              type="button"
              onClick={() => select("")}
              className={cn(
                "w-full px-3 py-2 text-left text-xs text-slate-400 transition-colors hover:bg-slate-50 dark:text-slate-500 dark:hover:bg-slate-700",
                !value && "bg-slate-50 dark:bg-slate-700",
              )}
            >
              — No test set —
            </button>

            {filtered.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-400 dark:text-slate-500">
                No test sets match your filter.
              </p>
            ) : (
              filtered.map((ts) => (
                <button
                  key={ts.issue_id}
                  type="button"
                  onClick={() => select(ts.issue_id)}
                  className={cn(
                    "flex w-full items-baseline gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-slate-50 dark:hover:bg-slate-700",
                    value === ts.issue_id && "bg-slate-50 dark:bg-slate-700",
                  )}
                >
                  <span className="shrink-0 font-mono text-slate-500 dark:text-slate-400">
                    {ts.jira.key}
                  </span>
                  <span className="min-w-0 truncate text-slate-700 dark:text-slate-200">
                    {ts.jira.summary}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
