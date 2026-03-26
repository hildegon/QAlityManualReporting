import { memo } from "react";
import { cn } from "@/components/ui/utils";
import { GripVertical, Layers } from "lucide-react";
import type { XrayTestSet } from "@/types";

export interface TestSetSourceRowProps {
  testSet: XrayTestSet;
  selected: boolean;
  onToggle: () => void;
  onMouseDown: (e: React.MouseEvent) => void;
}

export const TestSetSourceRow = memo(function TestSetSourceRow({
  testSet,
  selected,
  onToggle,
  onMouseDown,
}: TestSetSourceRowProps) {
  return (
    <div
      onMouseDown={onMouseDown}
      onClick={onToggle}
      className={cn(
        "flex cursor-pointer select-none items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-colors",
        selected
          ? "border-slate-700 bg-slate-700 text-white"
          : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:bg-slate-700",
      )}
    >
      <Layers className={cn("h-4 w-4 shrink-0", selected ? "text-white/60" : "text-slate-400")} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{testSet.jira.summary}</p>
        <p
          className={cn("mt-0.5 font-mono text-xs", selected ? "text-slate-300" : "text-slate-400")}
        >
          {testSet.jira.key}
        </p>
      </div>
      <GripVertical
        className={cn("h-4 w-4 shrink-0", selected ? "text-white/40" : "text-slate-300")}
      />
    </div>
  );
});
