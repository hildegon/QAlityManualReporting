import { cn } from "@/components/ui/utils";
import type { XrayTestSet } from "@/types";

interface TestSetRowProps {
  testSet: XrayTestSet;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}

export function TestSetRow({ testSet, selected, disabled, onToggle }: TestSetRowProps) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-3 px-3 py-2 text-sm transition-colors",
        selected ? "bg-slate-50 dark:bg-slate-700" : "hover:bg-slate-50 dark:hover:bg-slate-700",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        disabled={disabled}
        className="h-4 w-4 rounded border-slate-300 text-slate-900 accent-slate-800"
      />
      <span className="shrink-0 font-mono text-xs text-slate-500 dark:text-slate-400">
        {testSet.jira.key}
      </span>
      <span className="truncate text-slate-700 dark:text-slate-300">{testSet.jira.summary}</span>
    </label>
  );
}
