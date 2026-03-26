import { memo } from "react";
import { CheckSquare2, Square, Layers, GripVertical } from "lucide-react";

import type { XrayTest } from "@/types";
import type { TestSetInfo } from "@/services/queries";
import { cn } from "@/components/ui/utils";
import { isDeprecatingStatus, type ToastFn } from "./utils";
import { TransitionMenu } from "./TransitionMenu";

export interface TestRowProps {
  test: XrayTest;
  selected: boolean;
  memberOf: TestSetInfo[];
  onToggle: () => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onToast: ToastFn;
  onHide: (issueKey: string) => void;
}

export const TestRow = memo(function TestRow({
  test,
  selected,
  memberOf,
  onToggle,
  onMouseDown,
  onToast,
  onHide,
}: TestRowProps) {
  return (
    <div
      onMouseDown={onMouseDown}
      onClick={onToggle}
      className={cn(
        "group flex cursor-pointer select-none items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors",
        selected
          ? "border-slate-700 bg-slate-700 text-white"
          : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:bg-slate-700",
      )}
    >
      {/* Checkbox */}
      <span className="mt-0.5 shrink-0">
        {selected ? (
          <CheckSquare2 className="h-4 w-4 text-white" />
        ) : (
          <Square className="h-4 w-4 text-slate-300" />
        )}
      </span>

      {/* Summary + key */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{test.jira.summary}</p>
        <p
          className={cn("mt-0.5 font-mono text-xs", selected ? "text-slate-300" : "text-slate-400")}
        >
          {test.jira.key}
        </p>

        {/* Membership badges */}
        {memberOf.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {memberOf.map((ts) => (
              <span
                key={ts.issueId}
                title={ts.summary}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                  selected
                    ? "border-white/30 bg-white/10 text-white/80"
                    : "border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-400",
                )}
              >
                <Layers className="h-2.5 w-2.5 shrink-0" />
                {ts.key}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Right side: actions menu + drag handle */}
      <div className="mt-0.5 flex shrink-0 items-center gap-1">
        <div className="opacity-0 transition-opacity group-hover:opacity-100">
          <TransitionMenu
            issueKey={test.jira.key}
            onToast={onToast}
            onTransitioned={(name) => {
              if (isDeprecatingStatus(name)) onHide(test.jira.key);
            }}
            align="right"
            triggerClassName={
              selected ? "text-white/60 hover:bg-white/10 dark:hover:bg-white/10" : undefined
            }
          />
        </div>
        <GripVertical className={cn("h-4 w-4", selected ? "text-white/40" : "text-slate-300")} />
      </div>
    </div>
  );
});
